import type { MessageRow } from './rows'

export type WorkflowRunStatus = 'running' | 'completed' | 'failed'

export function workflowRunStatusToJSON(status: WorkflowRunStatus): string {
  switch (status) {
    case 'running':
      return 'WORKFLOW_RUN_STATUS_RUNNING'
    case 'completed':
      return 'WORKFLOW_RUN_STATUS_COMPLETED'
    case 'failed':
      return 'WORKFLOW_RUN_STATUS_FAILED'
  }
}

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

export type WorkflowRunView = {
  conversationId: string | null
  status: WorkflowRunStatus
  currentNodeId: string | null
  revision: number
  lastMessageId: string
  messages: MessageRow[]
}

export type InteractiveFlowState = {
  pendingQuestion: string | undefined
  pendingOptions: string[]
  deliveredMessages: string[]
  awaitingAnswer: boolean
  completed: boolean
}
