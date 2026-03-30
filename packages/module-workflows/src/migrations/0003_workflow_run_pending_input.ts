import type { Kysely } from 'kysely'
import type { WorkflowsDatabase } from '../db/schema'

export const workflowRunPendingInputMigration = {
  up: async (db: Kysely<WorkflowsDatabase>): Promise<void> => {
    await db.schema.alterTable('workflow_runs').addColumn('pending_input', 'jsonb').execute()
  },

  down: async (db: Kysely<WorkflowsDatabase>): Promise<void> => {
    await db.schema.alterTable('workflow_runs').dropColumn('pending_input').execute()
  },
}
