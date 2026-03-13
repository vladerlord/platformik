import type { SSEMessage } from '@fastify/sse'
import { WorkflowRunStatus, workflowRunStatusToJSON } from '@platformik/contracts-workflows-ts'
import { buildGetRunViewRequest } from './workflows-grpc'
import { WorkflowRunNotifierUnavailableError } from '../../features/workflows/workflow-run-notifier'
import type { SseDelta, StreamWorkflowEventsContext, WorkflowStreamState } from './workflows-stream.types'

export const createInitialWorkflowStreamState = (): WorkflowStreamState => ({
  lastRevision: -1,
  lastStatus: '',
  lastPendingInputJson: '',
})

export const mapRunViewToSseDeltas = (
  view: Awaited<ReturnType<StreamWorkflowEventsContext['workflowsClient']['getWorkflowRunView']>>,
  streamState: WorkflowStreamState,
): SseDelta => {
  const events: SSEMessage[] = []

  for (const message of view.messages) {
    events.push({ event: 'message', data: message })
  }

  const currentStatus = workflowRunStatusToJSON(view.status)
  if (view.revision !== streamState.lastRevision || currentStatus !== streamState.lastStatus) {
    streamState.lastRevision = view.revision
    streamState.lastStatus = currentStatus
    events.push({
      event: 'status',
      data: {
        status: currentStatus,
        revision: view.revision,
        currentNodeId: view.currentNodeId ?? null,
      },
    })
  }

  const pendingInputJson = view.pendingInput ? JSON.stringify(view.pendingInput) : ''
  if (pendingInputJson && pendingInputJson !== streamState.lastPendingInputJson) {
    streamState.lastPendingInputJson = pendingInputJson
    events.push({ event: 'pending_input', data: view.pendingInput })
  } else if (!pendingInputJson && streamState.lastPendingInputJson) {
    streamState.lastPendingInputJson = ''
    events.push({ event: 'pending_input', data: null })
  }

  const terminal =
    view.status === WorkflowRunStatus.WORKFLOW_RUN_STATUS_COMPLETED ||
    view.status === WorkflowRunStatus.WORKFLOW_RUN_STATUS_FAILED

  if (terminal && streamState.lastPendingInputJson) {
    streamState.lastPendingInputJson = ''
    events.push({ event: 'pending_input', data: null })
  }

  return {
    events,
    lastMessageId: view.lastMessageId?.value,
    terminal,
  }
}

export const streamWorkflowEvents = async function* (
  context: StreamWorkflowEventsContext,
): AsyncGenerator<SSEMessage> {
  let lastMessageId = context.afterId
  const streamState = createInitialWorkflowStreamState()
  let lastSeenRunVersion = context.workflowRunNotifier.getRunVersion(context.runId)

  const hydrateRunView = async (): Promise<
    Awaited<ReturnType<StreamWorkflowEventsContext['workflowsClient']['getWorkflowRunView']>>
  > =>
    context.workflowsClient.getWorkflowRunView(buildGetRunViewRequest(context.runId, lastMessageId), {
      metadata: context.metadata,
    })

  try {
    const initialView = await hydrateRunView()
    const initialDelta = mapRunViewToSseDeltas(initialView, streamState)
    for (const event of initialDelta.events) {
      yield event
    }

    if (initialDelta.lastMessageId) {
      lastMessageId = initialDelta.lastMessageId
    }

    if (initialDelta.terminal) {
      return
    }

    while (context.isConnected()) {
      const runVersion = await context.workflowRunNotifier.waitForRunTrigger(
        context.runId,
        lastSeenRunVersion,
        context.heartbeatIntervalMs,
      )

      if (!context.isConnected()) {
        return
      }

      if (runVersion === null) {
        yield { event: 'heartbeat', data: {} }
        continue
      }

      lastSeenRunVersion = runVersion
      const view = await hydrateRunView()
      const delta = mapRunViewToSseDeltas(view, streamState)
      for (const event of delta.events) {
        yield event
      }

      if (delta.lastMessageId) {
        lastMessageId = delta.lastMessageId
      }

      if (delta.terminal) {
        return
      }
    }
  } catch (error) {
    if (!context.isConnected()) {
      return
    }

    if (error instanceof WorkflowRunNotifierUnavailableError) {
      yield { event: 'error', data: { message: 'Workflow event stream is unavailable' } }

      return
    }

    yield { event: 'error', data: { message: String(error) } }
  }
}
