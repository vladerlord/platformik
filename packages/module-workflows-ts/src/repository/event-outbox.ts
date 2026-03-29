import type { Kysely } from 'kysely'
import { ResultAsync } from 'neverthrow'
import { uuidv7 } from 'uuidv7'
import type { EventOutboxRow, WorkflowsError } from '../contracts'
import type { WorkflowsDatabase } from '../db/schema'

export function insertEventOutboxEntry(
  db: Kysely<WorkflowsDatabase>,
  params: { topic: string; payload: Record<string, unknown> },
): ResultAsync<void, WorkflowsError> {
  const id = uuidv7()

  return ResultAsync.fromPromise(
    db
      .insertInto('event_outbox')
      .values({
        id,
        topic: params.topic,
        payload: JSON.stringify(params.payload),
        published_at: null,
      })
      .execute(),
    (cause) => ({ type: 'db_error' as const, cause }),
  ).map(() => undefined)
}

export function getPendingOutboxEntries(
  db: Kysely<WorkflowsDatabase>,
  limit: number,
): ResultAsync<EventOutboxRow[], WorkflowsError> {
  return ResultAsync.fromPromise(
    db
      .selectFrom('event_outbox')
      .selectAll()
      .where('published_at', 'is', null)
      .orderBy('created_at', 'asc')
      .limit(limit)
      .execute(),
    (cause) => ({ type: 'db_error' as const, cause }),
  ).map((rows) =>
    rows.map((row) => ({
      id: row.id,
      topic: row.topic,
      payload: row.payload as unknown as Record<string, unknown>,
      attempts: row.attempts,
      publishedAt: row.published_at,
      createdAt: row.created_at,
    })),
  )
}

export function markOutboxEntryPublished(
  db: Kysely<WorkflowsDatabase>,
  id: string,
): ResultAsync<void, WorkflowsError> {
  return ResultAsync.fromPromise(
    db.updateTable('event_outbox').set({ published_at: new Date() }).where('id', '=', id).execute(),
    (cause) => ({ type: 'db_error' as const, cause }),
  ).map(() => undefined)
}

export function incrementOutboxAttempts(
  db: Kysely<WorkflowsDatabase>,
  id: string,
): ResultAsync<void, WorkflowsError> {
  return ResultAsync.fromPromise(
    db
      .updateTable('event_outbox')
      .set((eb) => ({ attempts: eb('attempts', '+', 1) }))
      .where('id', '=', id)
      .execute(),
    (cause) => ({ type: 'db_error' as const, cause }),
  ).map(() => undefined)
}
