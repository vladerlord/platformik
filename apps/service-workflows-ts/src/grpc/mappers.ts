import { ServerError, Status } from 'nice-grpc'
import { match } from 'ts-pattern'
import { MessageRole, WorkflowRunStatus } from '@platformik/contracts-workflows-ts'

import type { WorkflowsError } from '@platformik/module-workflows-ts/contracts'

export function mapError(error: WorkflowsError): ServerError {
  return match(error)
    .with({ type: 'workflow_not_found' }, () => new ServerError(Status.NOT_FOUND, 'Workflow not found'))
    .with(
      { type: 'workflow_run_not_found' },
      () => new ServerError(Status.NOT_FOUND, 'Workflow run not found'),
    )
    .with(
      { type: 'conversation_not_found' },
      () => new ServerError(Status.NOT_FOUND, 'Conversation not found'),
    )
    .with({ type: 'db_error' }, (e) => new ServerError(Status.INTERNAL, `Database error: ${String(e.cause)}`))
    .exhaustive()
}

export function mapRunStatus(status: string): WorkflowRunStatus {
  return match(status)
    .with('running', () => WorkflowRunStatus.WORKFLOW_RUN_STATUS_RUNNING)
    .with('completed', () => WorkflowRunStatus.WORKFLOW_RUN_STATUS_COMPLETED)
    .with('failed', () => WorkflowRunStatus.WORKFLOW_RUN_STATUS_FAILED)
    .otherwise(() => WorkflowRunStatus.WORKFLOW_RUN_STATUS_UNSPECIFIED)
}

export function mapMessageRole(role: string): MessageRole {
  return match(role)
    .with('user', () => MessageRole.MESSAGE_ROLE_USER)
    .with('system', () => MessageRole.MESSAGE_ROLE_SYSTEM)
    .otherwise(() => MessageRole.MESSAGE_ROLE_UNSPECIFIED)
}
