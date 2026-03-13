import { ServerError, Status, type CallContext } from 'nice-grpc'
import { uuidv7 } from 'uuidv7'
import type {
  DeepPartial,
  GetWorkflowRunViewRequest,
  GetWorkflowRunViewResponse,
  ListWorkflowsRequest,
  ListWorkflowsResponse,
  StartWorkflowRequest,
  StartWorkflowResponse,
  SubmitAnswerRequest,
  SubmitAnswerResponse,
  WorkflowsServiceImplementation,
} from '@platformik/contracts-workflows-ts'

import type { Container } from '../container'
import { submitAnswerSignal, workflowStateQuery } from '../temporal/workflow'
import { mapError, mapMessageRole, mapRunStatus } from './mappers'

// ── Auth context ────────────────────────────────────────────────────────────

const AUTH_CONTEXT_METADATA_KEY = 'x-platformik-auth-context'

type MetadataAuthContext = {
  subject?: { userId?: string; email?: string; emailVerified?: boolean }
}

function getUserIdFromMetadata(context: CallContext): string {
  const json = context.metadata.get(AUTH_CONTEXT_METADATA_KEY)
  if (typeof json !== 'string') return ''
  try {
    const ctx = JSON.parse(json) as MetadataAuthContext

    return ctx.subject?.userId ?? ''
  } catch {
    return ''
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function resolveOptionByRaw(raw: string, options: string[]): string | undefined {
  if (/^\d+$/.test(raw)) {
    const index = parseInt(raw, 10) - 1
    if (index >= 0 && index < options.length) return options[index]
  } else {
    return options.find((o) => o.toLowerCase() === raw.toLowerCase())
  }

  return undefined
}

// ── Factory ────────────────────────────────────────────────────────────────

export function createWorkflowsGrpcService(container: Container): WorkflowsServiceImplementation {
  return {
    async listWorkflows(
      _request: ListWorkflowsRequest,
      context: CallContext,
    ): Promise<DeepPartial<ListWorkflowsResponse>> {
      const userId = getUserIdFromMetadata(context)
      const result = await container.workflows.listWorkflows(userId)
      if (result.isErr()) throw mapError(result.error)

      return { workflows: result.value.map((w) => ({ id: { value: w.id }, title: w.title })) }
    },

    async startWorkflow(
      request: StartWorkflowRequest,
      context: CallContext,
    ): Promise<DeepPartial<StartWorkflowResponse>> {
      const userId = getUserIdFromMetadata(context)
      const workflowId = request.workflowId?.value ?? ''

      const schemaResult = await container.workflows.getWorkflowSchema(workflowId)
      if (schemaResult.isErr()) throw mapError(schemaResult.error)

      const conversationResult = await container.workflows.createConversation({ userId })
      if (conversationResult.isErr()) throw mapError(conversationResult.error)
      const conversation = conversationResult.value

      const workflowRunId = uuidv7()

      await container.temporalClient.workflow.start('interactiveDslWorkflow', {
        taskQueue: container.temporalTaskQueue,
        workflowId: workflowRunId,
        args: [schemaResult.value],
      })

      const insertResult = await container.workflows.insertWorkflowRun({
        id: workflowRunId,
        workflowId,
        userId,
        temporalWorkflowId: workflowRunId,
        conversationId: conversation.id,
      })
      if (insertResult.isErr()) throw mapError(insertResult.error)
      const runId = insertResult.value

      const runEventResult = await container.workflows.insertRunEvent({
        runId,
        sequence: 1,
        type: 'run_started',
        payload: { workflowId, userId, conversationId: conversation.id },
      })
      if (runEventResult.isErr()) throw mapError(runEventResult.error)

      const outboxResult = await container.workflows.insertEventOutboxEntry({
        topic: 'workflow.run.started',
        payload: { runId, workflowId, userId, conversationId: conversation.id },
      })
      if (outboxResult.isErr()) throw mapError(outboxResult.error)

      return {
        workflowRunId: { value: runId },
        conversationId: { value: conversation.id },
        temporalWorkflowId: workflowRunId,
      }
    },

    async getWorkflowRunView(
      request: GetWorkflowRunViewRequest,
      context: CallContext,
    ): Promise<DeepPartial<GetWorkflowRunViewResponse>> {
      const userId = getUserIdFromMetadata(context)
      const runId = request.workflowRunId?.value ?? ''
      const afterId = request.afterId?.value

      const runResult = await container.workflows.getWorkflowRun(runId)
      if (runResult.isErr()) throw mapError(runResult.error)
      if (runResult.value.userId !== userId) {
        throw new ServerError(Status.PERMISSION_DENIED, 'Access denied')
      }

      const viewResult = await container.workflows.getWorkflowRunView(
        afterId !== undefined ? { runId, afterId } : { runId },
      )
      if (viewResult.isErr()) throw mapError(viewResult.error)
      const view = viewResult.value

      const messages = view.messages.map((m) => ({
        id: { value: m.id },
        conversationId: { value: m.conversationId },
        runId: { value: m.runId },
        role: mapMessageRole(m.role),
        content: m.content as Record<string, unknown>,
      }))

      let pendingInput: DeepPartial<GetWorkflowRunViewResponse>['pendingInput'] = undefined

      if (view.status === 'running') {
        try {
          const state = await container.temporalClient.workflow
            .getHandle(runResult.value.temporalWorkflowId)
            .query(workflowStateQuery)

          if (state.awaitingAnswer && state.pendingQuestion && state.pendingOptions.length > 0) {
            pendingInput = {
              optionInput: {
                label: state.pendingQuestion,
                options: state.pendingOptions.map((label, i) => ({ id: String(i + 1), label })),
              },
            }
          }
        } catch {
          // Temporal query may fail if workflow is not yet running — return no pending input
        }
      }

      return {
        conversationId: view.conversationId ? { value: view.conversationId } : undefined,
        status: mapRunStatus(view.status),
        currentNodeId: view.currentNodeId ?? '',
        revision: view.revision,
        lastMessageId: view.lastMessageId ? { value: view.lastMessageId } : undefined,
        messages,
        pendingInput,
      }
    },

    async submitAnswer(
      request: SubmitAnswerRequest,
      context: CallContext,
    ): Promise<DeepPartial<SubmitAnswerResponse>> {
      const userId = getUserIdFromMetadata(context)
      const runId = request.workflowRunId?.value ?? ''

      const runResult = await container.workflows.getWorkflowRun(runId)
      if (runResult.isErr()) throw mapError(runResult.error)
      const run = runResult.value

      if (run.userId !== userId) {
        throw new ServerError(Status.PERMISSION_DENIED, 'Access denied')
      }

      if (!run.conversationId) {
        throw new ServerError(Status.FAILED_PRECONDITION, 'Workflow run has no conversation')
      }

      let rawValue: string
      if (request.selectOption?.optionId !== undefined) {
        rawValue = request.selectOption.optionId
      } else if (request.selectOption?.rawInput !== undefined) {
        rawValue = request.selectOption.rawInput
      } else {
        throw new ServerError(Status.INVALID_ARGUMENT, 'No answer provided')
      }

      const handle = container.temporalClient.workflow.getHandle(run.temporalWorkflowId)
      const state = await handle.query(workflowStateQuery)

      let selectedLabel = rawValue
      if (state.pendingOptions.length > 0) {
        const resolved = resolveOptionByRaw(rawValue, state.pendingOptions)
        if (resolved === undefined) {
          throw new ServerError(
            Status.INVALID_ARGUMENT,
            `Invalid option: ${rawValue}. Valid options: ${state.pendingOptions.join(', ')}`,
          )
        }
        selectedLabel = resolved
      }

      const selectedIdx = state.pendingOptions.indexOf(selectedLabel)
      const optionId = selectedIdx >= 0 ? String(selectedIdx + 1) : rawValue

      const messageResult = await container.workflows.insertMessage({
        conversationId: run.conversationId,
        runId,
        role: 'user',
        content: {
          version: 1,
          type: 'option_response',
          content: { selected: [{ id: optionId, label: selectedLabel }] },
        },
      })
      if (messageResult.isErr()) throw mapError(messageResult.error)

      const maxSequenceRow = await container.db
        .selectFrom('run_events')
        .select(container.db.fn.max('sequence').as('max_seq'))
        .where('run_id', '=', runId)
        .executeTakeFirst()
      const nextSequence = Number(maxSequenceRow?.max_seq ?? 0) + 1

      const runEventResult = await container.workflows.insertRunEvent({
        runId,
        sequence: nextSequence,
        type: 'answer_received',
        payload: { messageId: messageResult.value.id, optionId, label: selectedLabel },
      })
      if (runEventResult.isErr()) throw mapError(runEventResult.error)

      const outboxResult = await container.workflows.insertEventOutboxEntry({
        topic: 'workflow.answer.received',
        payload: { runId, messageId: messageResult.value.id, optionId, label: selectedLabel },
      })
      if (outboxResult.isErr()) throw mapError(outboxResult.error)

      await handle.signal(submitAnswerSignal, rawValue)

      return {}
    },
  }
}
