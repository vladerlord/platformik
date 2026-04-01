import type { Kysely } from 'kysely'
import type { ResultAsync } from 'neverthrow'
import type { WorkflowsDatabase } from '../../db/schema'
import type { WorkflowsError } from './errors'
import type { FlowDefinition, WorkflowSummary } from './flow'
import type { MessageContent, MessageRole } from './messages'
import type { ConversationRow, EventOutboxRow, MessageRow } from './rows'
import type { WorkflowRunRow, WorkflowRunStatus, WorkflowRunView } from './runs'

export type WorkflowsModule = {
  catalog: {
    list(userId: string): ResultAsync<WorkflowSummary[], WorkflowsError>
    getSchema(workflowId: string): ResultAsync<FlowDefinition, WorkflowsError>
  }
  runs: {
    create(params: {
      id?: string
      workflowId: string
      userId: string
      temporalWorkflowId: string
      conversationId?: string
    }): ResultAsync<string, WorkflowsError>
    get(runId: string): ResultAsync<WorkflowRunRow, WorkflowsError>
    update(params: {
      runId: string
      status?: WorkflowRunStatus
      currentNodeId?: string | null
      conversationId?: string
    }): ResultAsync<void, WorkflowsError>
    complete(runId: string, result: unknown): ResultAsync<void, WorkflowsError>
    fail(runId: string, errorMessage: string): ResultAsync<void, WorkflowsError>
    getView(params: { runId: string; afterId?: string }): ResultAsync<WorkflowRunView, WorkflowsError>
  }
  conversations: {
    create(params: { userId: string }): ResultAsync<ConversationRow, WorkflowsError>
  }
  messages: {
    create(params: {
      id?: string
      conversationId: string
      runId: string
      role: MessageRole
      content: MessageContent
    }): ResultAsync<MessageRow, WorkflowsError>
  }
  nodeRuns: {
    create(params: { runId: string; nodeId: string; status: string }): ResultAsync<string, WorkflowsError>
    update(params: { id: string; status: string; completedAt?: Date }): ResultAsync<void, WorkflowsError>
  }
  events: {
    append(params: {
      runId: string
      sequence: number
      type: string
      payload: Record<string, unknown>
    }): ResultAsync<void, WorkflowsError>
  }
  outbox: {
    enqueue(params: { topic: string; payload: Record<string, unknown> }): ResultAsync<void, WorkflowsError>
    listPending(limit: number): ResultAsync<EventOutboxRow[], WorkflowsError>
    markPublished(id: string): ResultAsync<void, WorkflowsError>
    incrementAttempts(id: string): ResultAsync<void, WorkflowsError>
  }
}

export type WorkflowsModuleDeps = {
  db: Kysely<WorkflowsDatabase>
}
