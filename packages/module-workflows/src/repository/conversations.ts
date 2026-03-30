import type { Kysely } from 'kysely'
import { ResultAsync } from 'neverthrow'
import { uuidv7 } from 'uuidv7'
import type { ConversationRow, WorkflowsError } from '../contracts'
import type { WorkflowsDatabase } from '../db/schema'

export function createConversation(
  db: Kysely<WorkflowsDatabase>,
  params: { userId: string },
): ResultAsync<ConversationRow, WorkflowsError> {
  const id = uuidv7()

  return ResultAsync.fromPromise(
    db
      .insertInto('conversations')
      .values({ id, user_id: params.userId })
      .returning(['id', 'user_id', 'created_at', 'updated_at'])
      .executeTakeFirstOrThrow(),
    (cause) => ({ type: 'db_error' as const, cause }),
  ).map((row) => ({
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}
