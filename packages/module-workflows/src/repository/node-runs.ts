import type { Kysely } from 'kysely'
import { ResultAsync } from 'neverthrow'
import { uuidv7 } from 'uuidv7'
import type { WorkflowsError } from '../public/contracts/errors'
import type { WorkflowsDatabase } from '../db/schema'

export function insertNodeRun(
  db: Kysely<WorkflowsDatabase>,
  params: { runId: string; nodeId: string; status: string },
): ResultAsync<string, WorkflowsError> {
  const id = uuidv7()

  return ResultAsync.fromPromise(
    db
      .insertInto('node_runs')
      .values({
        id,
        run_id: params.runId,
        node_id: params.nodeId,
        status: params.status,
        completed_at: null,
      })
      .execute(),
    (cause) => ({ type: 'db_error' as const, cause }),
  ).map(() => id)
}

export function updateNodeRun(
  db: Kysely<WorkflowsDatabase>,
  params: { id: string; status: string; completedAt?: Date },
): ResultAsync<void, WorkflowsError> {
  return ResultAsync.fromPromise(
    db
      .updateTable('node_runs')
      .set({
        status: params.status,
        updated_at: new Date(),
        ...(params.completedAt !== undefined ? { completed_at: params.completedAt } : {}),
      })
      .where('id', '=', params.id)
      .execute(),
    (cause) => ({ type: 'db_error' as const, cause }),
  ).map(() => undefined)
}
