import type { Kysely } from 'kysely'
import { ResultAsync, err, ok } from 'neverthrow'
import type { WorkflowsError } from '../public/contracts/errors'
import type { FlowDefinition, WorkflowSummary } from '../public/contracts/flow'
import type { WorkflowsDatabase } from '../db/schema'

export function listWorkflows(
  db: Kysely<WorkflowsDatabase>,
  userId: string,
): ResultAsync<WorkflowSummary[], WorkflowsError> {
  return ResultAsync.fromPromise(
    db.selectFrom('workflows').select(['id', 'title']).where('user_id', '=', userId).execute(),
    (cause) => ({ type: 'db_error' as const, cause }),
  )
}

export function getWorkflowSchema(
  db: Kysely<WorkflowsDatabase>,
  workflowId: string,
): ResultAsync<FlowDefinition, WorkflowsError> {
  return ResultAsync.fromPromise(
    db.selectFrom('workflows').select('schema').where('id', '=', workflowId).executeTakeFirst(),
    (cause) => ({ type: 'db_error' as const, cause }),
  ).andThen((row) => {
    if (row === undefined) {
      return err({ type: 'workflow_not_found' as const })
    }

    return ok(row.schema as unknown as FlowDefinition)
  })
}
