import {
  workflowRunStatusToJSON,
  type WorkflowsDatabase,
  type WorkflowsModule,
} from '@platformik/module-workflows/contracts'
import type { Client } from '@temporalio/client'
import type { Kysely } from 'kysely'
import type { Result } from 'neverthrow'
import { uuidv7 } from 'uuidv7'

type AuthContext = {
  userId: string
}

type SelectOptionAnswer = {
  optionId?: string | undefined
  rawInput?: string | undefined
}

type WorkflowPendingInput = {
  optionInput: {
    label: string
    options: Array<{ id: string; label: string }>
  }
}

type WorkflowMessage = {
  id: { value: string }
  conversationId: { value: string }
  runId: { value: string }
  role: number
  content: Record<string, unknown>
}

type WorkflowRunViewResult = {
  conversationId: { value: string } | undefined
  status: string
  currentNodeId: string | undefined
  revision: number
  lastMessageId: { value: string } | undefined
  messages: WorkflowMessage[]
  pendingInput: WorkflowPendingInput | undefined
}

type StartWorkflowResult = {
  workflowRunId: { value: string }
  conversationId: { value: string }
  temporalWorkflowId: string
}

export type WorkflowsService = {
  listWorkflows(context: AuthContext): Promise<{ workflows: Array<{ id: { value: string }; title: string }> }>
  startWorkflow(params: { workflowId: string; context: AuthContext }): Promise<StartWorkflowResult>
  getWorkflowRunView(params: {
    workflowRunId: string
    afterId?: string
    context: AuthContext
  }): Promise<WorkflowRunViewResult>
  submitAnswer(params: {
    workflowRunId: string
    selectOption: SelectOptionAnswer
    context: AuthContext
  }): Promise<void>
}

export class WorkflowsServiceError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 412 | 500,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'WorkflowsServiceError'
  }
}

function throwIfError<T, E extends { type: string }>(result: Result<T, E>): T {
  if (!result.isErr()) {
    return result.value
  }

  const error = result.error
  if (
    error.type === 'workflow_not_found' ||
    error.type === 'workflow_run_not_found' ||
    error.type === 'conversation_not_found'
  ) {
    throw new WorkflowsServiceError(404, 'NOT_FOUND', 'Workflow resource not found')
  }

  throw new WorkflowsServiceError(500, 'INTERNAL', String(error))
}

function resolveOptionByRaw(raw: string, options: string[]): string | undefined {
  if (/^\d+$/.test(raw)) {
    const index = parseInt(raw, 10) - 1
    if (index >= 0 && index < options.length) return options[index]
  } else {
    return options.find((option) => option.toLowerCase() === raw.toLowerCase())
  }

  return undefined
}

function mapMessageRole(role: string): 1 | 2 {
  return role === 'user' ? 1 : 2
}

export function createWorkflowsService(params: {
  workflows: WorkflowsModule
  workflowsDb: Kysely<WorkflowsDatabase>
  temporalClient: Client
  temporalTaskQueue: string
}): WorkflowsService {
  const { workflows, workflowsDb, temporalClient, temporalTaskQueue } = params

  return {
    async listWorkflows(context) {
      const result = await workflows.catalog.list(context.userId)
      const workflowList = throwIfError(result)

      return {
        workflows: workflowList.map((workflow) => ({
          id: { value: workflow.id },
          title: workflow.title,
        })),
      }
    },

    async startWorkflow({ workflowId, context }) {
      const schemaResult = await workflows.catalog.getSchema(workflowId)
      const schema = throwIfError(schemaResult)

      const conversationResult = await workflows.conversations.create({ userId: context.userId })
      const conversation = throwIfError(conversationResult)

      const workflowRunId = uuidv7()

      await temporalClient.workflow.start('interactiveDslWorkflow', {
        taskQueue: temporalTaskQueue,
        workflowId: workflowRunId,
        args: [schema],
      })

      const insertResult = await workflows.runs.create({
        id: workflowRunId,
        workflowId,
        userId: context.userId,
        temporalWorkflowId: workflowRunId,
        conversationId: conversation.id,
      })
      throwIfError(insertResult)

      const runEventResult = await workflows.events.append({
        runId: workflowRunId,
        sequence: 1,
        type: 'run_started',
        payload: { workflowId, userId: context.userId, conversationId: conversation.id },
      })
      throwIfError(runEventResult)

      const outboxResult = await workflows.outbox.enqueue({
        topic: 'workflow.run.started',
        payload: {
          runId: workflowRunId,
          workflowId,
          userId: context.userId,
          conversationId: conversation.id,
        },
      })
      throwIfError(outboxResult)

      return {
        workflowRunId: { value: workflowRunId },
        conversationId: { value: conversation.id },
        temporalWorkflowId: workflowRunId,
      }
    },

    async getWorkflowRunView({ workflowRunId, afterId, context }) {
      const runResult = await workflows.runs.get(workflowRunId)
      const run = throwIfError(runResult)
      if (run.userId !== context.userId) {
        throw new WorkflowsServiceError(403, 'PERMISSION_DENIED', 'Access denied')
      }

      const viewParams = afterId !== undefined ? { runId: workflowRunId, afterId } : { runId: workflowRunId }
      const viewResult = await workflows.runs.getView(viewParams)
      const view = throwIfError(viewResult)

      const messages: WorkflowMessage[] = view.messages.map((message) => ({
        id: { value: message.id },
        conversationId: { value: message.conversationId },
        runId: { value: message.runId },
        role: mapMessageRole(message.role),
        content: message.content as Record<string, unknown>,
      }))

      let pendingInput: WorkflowPendingInput | undefined
      if (view.status === 'running') {
        try {
          const state = await temporalClient.workflow.getHandle(run.temporalWorkflowId).query<{
            awaitingAnswer: boolean
            pendingQuestion?: string
            pendingOptions: string[]
          }>('workflowState')

          if (state.awaitingAnswer && state.pendingQuestion && state.pendingOptions.length > 0) {
            pendingInput = {
              optionInput: {
                label: state.pendingQuestion,
                options: state.pendingOptions.map((label, index) => ({ id: String(index + 1), label })),
              },
            }
          }
        } catch {
          // Temporal query can fail if workflow has not started yet.
        }
      }

      return {
        conversationId: view.conversationId ? { value: view.conversationId } : undefined,
        status: workflowRunStatusToJSON(view.status),
        currentNodeId: view.currentNodeId ?? undefined,
        revision: view.revision,
        lastMessageId: view.lastMessageId ? { value: view.lastMessageId } : undefined,
        messages,
        pendingInput,
      }
    },

    async submitAnswer({ workflowRunId, selectOption, context }) {
      const runResult = await workflows.runs.get(workflowRunId)
      const run = throwIfError(runResult)

      if (run.userId !== context.userId) {
        throw new WorkflowsServiceError(403, 'PERMISSION_DENIED', 'Access denied')
      }

      if (!run.conversationId) {
        throw new WorkflowsServiceError(412, 'FAILED_PRECONDITION', 'Workflow run has no conversation')
      }

      let rawValue: string
      if (selectOption.optionId !== undefined) {
        rawValue = selectOption.optionId
      } else if (selectOption.rawInput !== undefined) {
        rawValue = selectOption.rawInput
      } else {
        throw new WorkflowsServiceError(400, 'INVALID_ARGUMENT', 'No answer provided')
      }

      const handle = temporalClient.workflow.getHandle(run.temporalWorkflowId)
      const state = await handle.query<{ pendingOptions: string[] }>('workflowState')

      let selectedLabel = rawValue
      if (state.pendingOptions.length > 0) {
        const resolved = resolveOptionByRaw(rawValue, state.pendingOptions)
        if (resolved === undefined) {
          throw new WorkflowsServiceError(
            400,
            'INVALID_ARGUMENT',
            `Invalid option: ${rawValue}. Valid options: ${state.pendingOptions.join(', ')}`,
          )
        }
        selectedLabel = resolved
      }

      const selectedIndex = state.pendingOptions.indexOf(selectedLabel)
      const optionId = selectedIndex >= 0 ? String(selectedIndex + 1) : rawValue

      const messageResult = await workflows.messages.create({
        conversationId: run.conversationId,
        runId: workflowRunId,
        role: 'user',
        content: {
          version: 1,
          type: 'option_response',
          content: { selected: [{ id: optionId, label: selectedLabel }] },
        },
      })
      const message = throwIfError(messageResult)

      const maxSequenceRow = await workflowsDb
        .selectFrom('run_events')
        .select(workflowsDb.fn.max('sequence').as('max_sequence'))
        .where('run_id', '=', workflowRunId)
        .executeTakeFirst()
      const nextSequence = Number(maxSequenceRow?.max_sequence ?? 0) + 1

      const runEventResult = await workflows.events.append({
        runId: workflowRunId,
        sequence: nextSequence,
        type: 'answer_received',
        payload: { messageId: message.id, optionId, label: selectedLabel },
      })
      throwIfError(runEventResult)

      const outboxResult = await workflows.outbox.enqueue({
        topic: 'workflow.answer.received',
        payload: { runId: workflowRunId, messageId: message.id, optionId, label: selectedLabel },
      })
      throwIfError(outboxResult)

      await handle.signal('submitAnswer', rawValue)
    },
  }
}
