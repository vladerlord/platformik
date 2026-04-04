import type { Kysely } from 'kysely'
import { ResultAsync } from 'neverthrow'
import { uuidv7 } from 'uuidv7'
import type { WorkflowsError } from '../public/contracts/errors'
import type { MessageContent, MessageRole } from '../public/contracts/messages'
import type { MessageRow } from '../public/contracts/rows'
import type { WorkflowsDatabase } from '../db/schema'

export function insertMessage(
  db: Kysely<WorkflowsDatabase>,
  params: {
    id?: string
    conversationId: string
    runId: string
    role: MessageRole
    content: MessageContent
  },
): ResultAsync<MessageRow, WorkflowsError> {
  const id = params.id ?? uuidv7()

  return ResultAsync.fromPromise(
    db
      .insertInto('messages')
      .values({
        id,
        conversation_id: params.conversationId,
        run_id: params.runId,
        role: params.role,
        content: JSON.stringify(params.content),
      })
      .onConflict((oc) => oc.column('id').doUpdateSet({ updated_at: (eb) => eb.ref('messages.updated_at') }))
      .returning(['id', 'conversation_id', 'run_id', 'role', 'content', 'created_at', 'updated_at'])
      .executeTakeFirstOrThrow(),
    (cause) => ({ type: 'db_error' as const, cause }),
  ).map((row) => ({
    id: row.id,
    conversationId: row.conversation_id,
    runId: row.run_id,
    role: row.role as MessageRole,
    content: row.content as unknown as MessageContent,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}
