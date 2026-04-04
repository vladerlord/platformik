import type { SSEMessage } from '@fastify/sse'
import type { WorkflowsService } from './workflows-service'
import type { WorkflowRunNotifier } from '../../features/workflows/workflow-run-notifier.types'

export type WorkflowStreamState = {
  lastRevision: number
  lastStatus: string
  lastPendingInputJson: string
}

export type SseDelta = {
  events: SSEMessage[]
  lastMessageId: string | undefined
  terminal: boolean
}

export type StreamWorkflowEventsContext = {
  runId: string
  afterId: string | undefined
  authContext: { userId: string }
  workflowsService: WorkflowsService
  workflowRunNotifier: WorkflowRunNotifier
  heartbeatIntervalMs: number
  isConnected: () => boolean
}
