export type WorkflowsError =
  | { type: 'workflow_not_found' }
  | { type: 'workflow_run_not_found' }
  | { type: 'conversation_not_found' }
  | { type: 'db_error'; cause: unknown }
