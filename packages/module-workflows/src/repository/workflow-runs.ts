import type { Kysely } from 'kysely'
import { ResultAsync, err, ok } from 'neverthrow'
import { uuidv7 } from 'uuidv7'
import type { MessageContent, MessageRole } from '../public/contracts/messages'
import type { WorkflowsError } from '../public/contracts/errors'
import type { MessageRow } from '../public/contracts/rows'
import type { WorkflowRunRow, WorkflowRunStatus, WorkflowRunView } from '../public/contracts/runs'
import type { WorkflowsDatabase } from '../db/schema'

export function insertWorkflowRun(
  db: Kysely<WorkflowsDatabase>,
  params: {
    id?: string
    workflowId: string
    userId: string
    temporalWorkflowId: string
    conversationId?: string
  },
): ResultAsync<string, WorkflowsError> {
  const id = params.id ?? uuidv7()

  return ResultAsync.fromPromise(
    db
      .insertInto('workflow_runs')
      .values({
        id,
        workflow_id: params.workflowId,
        user_id: params.userId,
        temporal_workflow_id: params.temporalWorkflowId,
        conversation_id: params.conversationId ?? null,
        current_node_id: null,
        status: 'running',
        completed_at: null,
        result: null,
      })
      .execute(),
    (cause) => ({ type: 'db_error' as const, cause }),
  ).map(() => id)
}

export function getWorkflowRun(
  db: Kysely<WorkflowsDatabase>,
  runId: string,
): ResultAsync<WorkflowRunRow, WorkflowsError> {
  return ResultAsync.fromPromise(
    db.selectFrom('workflow_runs').selectAll().where('id', '=', runId).executeTakeFirst(),
    (cause) => ({ type: 'db_error' as const, cause }),
  ).andThen((row) => {
    if (row === undefined) {
      return err({ type: 'workflow_run_not_found' as const })
    }

    return ok({
      id: row.id,
      workflowId: row.workflow_id,
      userId: row.user_id,
      temporalWorkflowId: row.temporal_workflow_id,
      conversationId: row.conversation_id,
      currentNodeId: row.current_node_id,
      status: row.status as WorkflowRunStatus,
      revision: Number(row.revision),
      startedAt: row.started_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      result: row.result,
    })
  })
}

export function updateWorkflowRun(
  db: Kysely<WorkflowsDatabase>,
  params: {
    runId: string
    status?: WorkflowRunStatus
    currentNodeId?: string | null
    conversationId?: string
  },
): ResultAsync<void, WorkflowsError> {
  return ResultAsync.fromPromise(
    db
      .updateTable('workflow_runs')
      .set((eb) => ({
        ...(params.status !== undefined ? { status: params.status } : {}),
        ...('currentNodeId' in params ? { current_node_id: params.currentNodeId } : {}),
        ...(params.conversationId !== undefined ? { conversation_id: params.conversationId } : {}),
        revision: eb('revision', '+', 1),
        updated_at: new Date(),
      }))
      .where('id', '=', params.runId)
      .execute(),
    (cause) => ({ type: 'db_error' as const, cause }),
  ).map(() => undefined)
}

export function completeWorkflowRun(
  db: Kysely<WorkflowsDatabase>,
  runId: string,
  result: unknown,
): ResultAsync<void, WorkflowsError> {
  return ResultAsync.fromPromise(
    db
      .updateTable('workflow_runs')
      .set((eb) => ({
        status: 'completed',
        completed_at: new Date(),
        result: JSON.stringify(result),
        revision: eb('revision', '+', 1),
        updated_at: new Date(),
      }))
      .where('id', '=', runId)
      .execute(),
    (cause) => ({ type: 'db_error' as const, cause }),
  ).map(() => undefined)
}

export function failWorkflowRun(
  db: Kysely<WorkflowsDatabase>,
  runId: string,
  errorMessage: string,
): ResultAsync<void, WorkflowsError> {
  return ResultAsync.fromPromise(
    db
      .updateTable('workflow_runs')
      .set((eb) => ({
        status: 'failed',
        completed_at: new Date(),
        result: JSON.stringify({ errorMessage }),
        revision: eb('revision', '+', 1),
        updated_at: new Date(),
      }))
      .where('id', '=', runId)
      .execute(),
    (cause) => ({ type: 'db_error' as const, cause }),
  ).map(() => undefined)
}

export function getWorkflowRunView(
  db: Kysely<WorkflowsDatabase>,
  params: { runId: string; afterId?: string },
): ResultAsync<WorkflowRunView, WorkflowsError> {
  const runQuery = db
    .selectFrom('workflow_runs')
    .select(['id', 'conversation_id', 'status', 'current_node_id', 'revision'])
    .where('id', '=', params.runId)
    .executeTakeFirst()

  return ResultAsync.fromPromise(runQuery, (cause) => ({
    type: 'db_error' as const,
    cause,
  })).andThen((run) => {
    if (run === undefined) {
      return err({ type: 'workflow_run_not_found' as const })
    }

    if (run.conversation_id === null) {
      return ok<WorkflowRunView, WorkflowsError>({
        conversationId: null,
        status: run.status as WorkflowRunStatus,
        currentNodeId: run.current_node_id,
        revision: Number(run.revision),
        lastMessageId: '',
        messages: [],
      })
    }

    let messagesQuery = db
      .selectFrom('messages')
      .selectAll()
      .where('conversation_id', '=', run.conversation_id)
      .orderBy('id', 'asc')

    if (params.afterId) {
      messagesQuery = messagesQuery.where('id', '>', params.afterId)
    }

    return ResultAsync.fromPromise(messagesQuery.execute(), (cause) => ({
      type: 'db_error' as const,
      cause,
    })).map((rows) => {
      const messages: MessageRow[] = rows.map((row) => ({
        id: row.id,
        conversationId: row.conversation_id,
        runId: row.run_id,
        role: row.role as MessageRole,
        content: row.content as unknown as MessageContent,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))

      const lastMessageId = messages.length > 0 ? (messages[messages.length - 1]?.id ?? '') : ''

      return {
        conversationId: run.conversation_id,
        status: run.status as WorkflowRunStatus,
        currentNodeId: run.current_node_id,
        revision: Number(run.revision),
        lastMessageId,
        messages,
      } satisfies WorkflowRunView
    })
  })
}
