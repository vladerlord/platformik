import type { Kysely } from 'kysely'
import { ResultAsync } from 'neverthrow'
import { uuidv7 } from 'uuidv7'
import type { WorkflowsError } from '../public/contracts/errors'
import type { WorkflowsDatabase } from '../db/schema'

export function insertRunEvent(
  db: Kysely<WorkflowsDatabase>,
  params: {
    runId: string
    sequence: number
    type: string
    payload: Record<string, unknown>
  },
): ResultAsync<void, WorkflowsError> {
  const id = uuidv7()

  return ResultAsync.fromPromise(
    db
      .insertInto('run_events')
      .values({
        id,
        run_id: params.runId,
        sequence: params.sequence,
        type: params.type,
        payload: JSON.stringify(params.payload),
      })
      .onConflict((oc) => oc.constraint('run_events_run_sequence_unique').doNothing())
      .execute(),
    (cause) => ({ type: 'db_error' as const, cause }),
  ).map(() => undefined)
}
