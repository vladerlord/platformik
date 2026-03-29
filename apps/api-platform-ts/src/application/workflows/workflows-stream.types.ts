import type { SSEMessage } from '@fastify/sse'
import type { Metadata } from 'nice-grpc'
import type { WorkflowsClient } from '../../container'
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
  metadata: Metadata
  workflowsClient: WorkflowsClient
  workflowRunNotifier: WorkflowRunNotifier
  heartbeatIntervalMs: number
  isConnected: () => boolean
}
