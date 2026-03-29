import { type Kysely, sql } from 'kysely'
import type { WorkflowsDatabase } from '../db/schema'

export const workflowInteractionMigration = {
  up: async (db: Kysely<WorkflowsDatabase>): Promise<void> => {
    await db.schema
      .createTable('conversations')
      .addColumn('id', 'uuid', (col) => col.primaryKey())
      .addColumn('user_id', 'text', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute()

    await db.schema
      .alterTable('workflow_runs')
      .addColumn('conversation_id', 'uuid', (col) => col.references('conversations.id'))
      .execute()

    await db.schema.alterTable('workflow_runs').addColumn('current_node_id', 'text').execute()

    await db.schema
      .alterTable('workflow_runs')
      .addColumn('revision', 'bigint', (col) => col.notNull().defaultTo(0))
      .execute()

    await db.schema
      .alterTable('workflow_runs')
      .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute()

    await db.schema
      .createTable('messages')
      .addColumn('id', 'uuid', (col) => col.primaryKey())
      .addColumn('conversation_id', 'uuid', (col) =>
        col.notNull().references('conversations.id').onDelete('cascade'),
      )
      .addColumn('run_id', 'uuid', (col) => col.notNull().references('workflow_runs.id').onDelete('cascade'))
      .addColumn('role', 'text', (col) => col.notNull())
      .addColumn('content', 'jsonb', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute()

    await db.schema
      .createIndex('messages_conversation_created_idx')
      .on('messages')
      .columns(['conversation_id', 'id'])
      .execute()

    await db.schema
      .createTable('node_runs')
      .addColumn('id', 'uuid', (col) => col.primaryKey())
      .addColumn('run_id', 'uuid', (col) => col.notNull().references('workflow_runs.id').onDelete('cascade'))
      .addColumn('node_id', 'text', (col) => col.notNull())
      .addColumn('status', 'text', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addColumn('completed_at', 'timestamptz')
      .execute()

    await db.schema
      .createIndex('node_runs_run_node_idx')
      .on('node_runs')
      .columns(['run_id', 'node_id'])
      .execute()

    await db.schema
      .createTable('run_events')
      .addColumn('id', 'uuid', (col) => col.primaryKey())
      .addColumn('run_id', 'uuid', (col) => col.notNull().references('workflow_runs.id').onDelete('cascade'))
      .addColumn('sequence', 'bigint', (col) => col.notNull())
      .addColumn('type', 'text', (col) => col.notNull())
      .addColumn('payload', 'jsonb', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addUniqueConstraint('run_events_run_sequence_unique', ['run_id', 'sequence'])
      .execute()

    await db.schema
      .createTable('event_outbox')
      .addColumn('id', 'uuid', (col) => col.primaryKey())
      .addColumn('topic', 'text', (col) => col.notNull())
      .addColumn('payload', 'jsonb', (col) => col.notNull())
      .addColumn('attempts', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('published_at', 'timestamptz')
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute()

    await db.schema
      .createIndex('event_outbox_pending_idx')
      .on('event_outbox')
      .columns(['published_at', 'created_at'])
      .execute()
  },

  down: async (db: Kysely<WorkflowsDatabase>): Promise<void> => {
    await db.schema.dropIndex('event_outbox_pending_idx').ifExists().execute()
    await db.schema.dropTable('event_outbox').ifExists().execute()
    await db.schema.dropIndex('node_runs_run_node_idx').ifExists().execute()
    await db.schema.dropTable('node_runs').ifExists().execute()
    await db.schema.dropIndex('messages_conversation_created_idx').ifExists().execute()
    await db.schema.dropTable('messages').ifExists().execute()
    await db.schema.dropTable('run_events').ifExists().execute()
    await db.schema.alterTable('workflow_runs').dropColumn('updated_at').execute()
    await db.schema.alterTable('workflow_runs').dropColumn('revision').execute()
    await db.schema.alterTable('workflow_runs').dropColumn('current_node_id').execute()
    await db.schema.alterTable('workflow_runs').dropColumn('conversation_id').execute()
    await db.schema.dropTable('conversations').ifExists().execute()
  },
}
