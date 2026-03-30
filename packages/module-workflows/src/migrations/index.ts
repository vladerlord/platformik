import type { WorkflowsMigrations } from '../contracts'
import type { WorkflowsDatabase } from '../db/schema'
import { initialMigration } from './0001_initial'
import { workflowInteractionMigration } from './0002_workflow_interaction'
import { workflowRunPendingInputMigration } from './0003_workflow_run_pending_input'

export const workflowsMigrations: WorkflowsMigrations<WorkflowsDatabase> = {
  '0001_initial': initialMigration,
  '0002_workflow_interaction': workflowInteractionMigration,
  '0003_workflow_run_pending_input': workflowRunPendingInputMigration,
}
