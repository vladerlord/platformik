import type { ColumnType, Generated, JSONColumnType } from 'kysely'
import type { FlowDefinition, MessageContent } from '../contracts'

export interface WorkflowsTable {
  id: string
  user_id: string
  title: string
  schema: JSONColumnType<FlowDefinition>
  created_at: Generated<Date>
}

export interface WorkflowRunsTable {
  id: string
  workflow_id: string
  user_id: string
  temporal_workflow_id: string
  conversation_id: string | null
  current_node_id: string | null
  pending_input: JSONColumnType<Record<string, unknown> | null, string | null | undefined, string | null>
  status: string
  revision: Generated<number>
  started_at: Generated<Date>
  updated_at: Generated<Date>
  completed_at: Date | null
  result: ColumnType<Record<string, unknown> | null, string | null, string | null>
}

export interface ConversationsTable {
  id: string
  user_id: string
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export interface MessagesTable {
  id: string
  conversation_id: string
  run_id: string
  role: string
  content: JSONColumnType<MessageContent>
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export interface NodeRunsTable {
  id: string
  run_id: string
  node_id: string
  status: string
  created_at: Generated<Date>
  updated_at: Generated<Date>
  completed_at: Date | null
}

export interface RunEventsTable {
  id: string
  run_id: string
  sequence: number
  type: string
  payload: JSONColumnType<Record<string, unknown>>
  created_at: Generated<Date>
}

export interface EventOutboxTable {
  id: string
  topic: string
  payload: JSONColumnType<Record<string, unknown>>
  attempts: Generated<number>
  published_at: Date | null
  created_at: Generated<Date>
}

export interface WorkflowsDatabase {
  workflows: WorkflowsTable
  workflow_runs: WorkflowRunsTable
  conversations: ConversationsTable
  messages: MessagesTable
  node_runs: NodeRunsTable
  run_events: RunEventsTable
  event_outbox: EventOutboxTable
}
