import type { Kysely } from 'kysely'
import type { ResultAsync } from 'neverthrow'
import type { WorkflowsDatabase } from './db/schema'

export type { WorkflowsDatabase } from './db/schema'

// ── Domain types ──────────────────────────────────────────────────────────

export type NodeType = 'start' | 'option_selection' | 'send_message' | 'end'

export type FlowNodeOption = {
  label: string
  nextNodeId: string
}

export type FlowNode = {
  id: string
  type: NodeType
  nextNodeId?: string
  question?: string
  answerKey?: string
  messageTemplate?: string
  options?: FlowNodeOption[]
}

export type FlowDefinition = {
  version: string
  startNodeId: string
  nodes: FlowNode[]
}

export type WorkflowSummary = {
  id: string
  title: string
}

export type WorkflowRunStatus = 'running' | 'completed' | 'failed'

export type WorkflowRunRow = {
  id: string
  workflowId: string
  userId: string
  temporalWorkflowId: string
  conversationId: string | null
  currentNodeId: string | null
  status: WorkflowRunStatus
  revision: number
  startedAt: Date
  updatedAt: Date
  completedAt: Date | null
  result: unknown | null
}

// ── Message content model ─────────────────────────────────────────────────

export type MessageOption = {
  id: string
  label: string
}

export type TextMessageContent = {
  version: 1
  type: 'text'
  content: { text: string }
}

export type OptionInputMessageContent = {
  version: 1
  type: 'option_input'
  content: {
    label: string
    selection_mode: 'single' | 'multiple'
    options: MessageOption[]
  }
}

export type OptionResponseMessageContent = {
  version: 1
  type: 'option_response'
  content: { selected: MessageOption[] }
}

export type StatusMessageContent = {
  version: 1
  type: 'status'
  content: { text: string }
}

export type ErrorMessageContent = {
  version: 1
  type: 'error'
  content: { text: string }
}

export type MessageContent =
  | TextMessageContent
  | OptionInputMessageContent
  | OptionResponseMessageContent
  | StatusMessageContent
  | ErrorMessageContent

export type MessageRole = 'user' | 'system'

// ── Row types ─────────────────────────────────────────────────────────────

export type ConversationRow = {
  id: string
  userId: string
  createdAt: Date
  updatedAt: Date
}

export type MessageRow = {
  id: string
  conversationId: string
  runId: string
  role: MessageRole
  content: MessageContent
  createdAt: Date
  updatedAt: Date
}

export type NodeRunRow = {
  id: string
  runId: string
  nodeId: string
  status: string
  createdAt: Date
  updatedAt: Date
  completedAt: Date | null
}

export type RunEventRow = {
  id: string
  runId: string
  sequence: number
  type: string
  payload: Record<string, unknown>
  createdAt: Date
}

export type EventOutboxRow = {
  id: string
  topic: string
  payload: Record<string, unknown>
  attempts: number
  publishedAt: Date | null
  createdAt: Date
}

// ── View types ────────────────────────────────────────────────────────────

export type WorkflowRunView = {
  conversationId: string | null
  status: WorkflowRunStatus
  currentNodeId: string | null
  revision: number
  lastMessageId: string
  messages: MessageRow[]
}

// ── InteractiveFlowState (kept for Temporal activity compat) ─────────────

export type InteractiveFlowState = {
  pendingQuestion: string | undefined
  pendingOptions: string[]
  deliveredMessages: string[]
  awaitingAnswer: boolean
  completed: boolean
}

// ── Error types ───────────────────────────────────────────────────────────

export type WorkflowsError =
  | { type: 'workflow_not_found' }
  | { type: 'workflow_run_not_found' }
  | { type: 'conversation_not_found' }
  | { type: 'db_error'; cause: unknown }

// ── Module interface ──────────────────────────────────────────────────────

export type WorkflowsModule = {
  listWorkflows(userId: string): ResultAsync<WorkflowSummary[], WorkflowsError>
  getWorkflowSchema(workflowId: string): ResultAsync<FlowDefinition, WorkflowsError>
  insertWorkflowRun(params: {
    id?: string
    workflowId: string
    userId: string
    temporalWorkflowId: string
    conversationId?: string
  }): ResultAsync<string, WorkflowsError>
  getWorkflowRun(runId: string): ResultAsync<WorkflowRunRow, WorkflowsError>
  updateWorkflowRun(params: {
    runId: string
    status?: WorkflowRunStatus
    currentNodeId?: string | null
    conversationId?: string
  }): ResultAsync<void, WorkflowsError>
  completeWorkflowRun(runId: string, result: unknown): ResultAsync<void, WorkflowsError>
  createConversation(params: { userId: string }): ResultAsync<ConversationRow, WorkflowsError>
  insertMessage(params: {
    id?: string
    conversationId: string
    runId: string
    role: MessageRole
    content: MessageContent
  }): ResultAsync<MessageRow, WorkflowsError>
  insertNodeRun(params: {
    runId: string
    nodeId: string
    status: string
  }): ResultAsync<string, WorkflowsError>
  updateNodeRun(params: { id: string; status: string; completedAt?: Date }): ResultAsync<void, WorkflowsError>
  insertRunEvent(params: {
    runId: string
    sequence: number
    type: string
    payload: Record<string, unknown>
  }): ResultAsync<void, WorkflowsError>
  insertEventOutboxEntry(params: {
    topic: string
    payload: Record<string, unknown>
  }): ResultAsync<void, WorkflowsError>
  getWorkflowRunView(params: {
    runId: string
    afterId?: string
  }): ResultAsync<WorkflowRunView, WorkflowsError>
  getPendingOutboxEntries(limit: number): ResultAsync<EventOutboxRow[], WorkflowsError>
  markOutboxEntryPublished(id: string): ResultAsync<void, WorkflowsError>
  incrementOutboxAttempts(id: string): ResultAsync<void, WorkflowsError>
}

// ── Deps interface ────────────────────────────────────────────────────────

export type WorkflowsModuleDeps = {
  db: Kysely<WorkflowsDatabase>
}

// ── Migrations type ───────────────────────────────────────────────────────

export type WorkflowsMigrations<TDb> = Record<
  string,
  {
    up: (db: Kysely<TDb>) => Promise<void>
    down: (db: Kysely<TDb>) => Promise<void>
  }
>
