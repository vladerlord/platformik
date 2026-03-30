import { type Kysely, sql } from 'kysely'
import type { WorkflowsDatabase } from '../db/schema'

export const initialMigration = {
  up: async (db: Kysely<WorkflowsDatabase>): Promise<void> => {
    await db.schema
      .createTable('workflows')
      .addColumn('id', 'uuid', (col) => col.primaryKey())
      .addColumn('user_id', 'text', (col) => col.notNull())
      .addColumn('title', 'text', (col) => col.notNull())
      .addColumn('schema', 'jsonb', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute()

    await db.schema
      .createTable('workflow_runs')
      .addColumn('id', 'uuid', (col) => col.primaryKey())
      .addColumn('workflow_id', 'uuid', (col) => col.notNull().references('workflows.id').onDelete('cascade'))
      .addColumn('user_id', 'text', (col) => col.notNull())
      .addColumn('temporal_workflow_id', 'text', (col) => col.notNull())
      .addColumn('status', 'text', (col) => col.notNull())
      .addColumn('started_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addColumn('completed_at', 'timestamptz')
      .addColumn('result', 'jsonb')
      .execute()

    await db.schema
      .createIndex('workflow_runs_workflow_id_idx')
      .on('workflow_runs')
      .column('workflow_id')
      .execute()

    await db.schema.createIndex('workflow_runs_user_id_idx').on('workflow_runs').column('user_id').execute()
  },

  down: async (db: Kysely<WorkflowsDatabase>): Promise<void> => {
    await db.schema.dropIndex('workflow_runs_user_id_idx').ifExists().execute()
    await db.schema.dropIndex('workflow_runs_workflow_id_idx').ifExists().execute()
    await db.schema.dropTable('workflow_runs').ifExists().execute()
    await db.schema.dropTable('workflows').ifExists().execute()
  },
}
