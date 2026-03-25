import type { AuthContext } from '@platformik/contracts-auth-ts'
import type { SSEMessage } from '@fastify/sse'
import type { IamModule, SessionUser } from '@platformik/module-iam-ts/contracts'
import type { FastifyInstance } from '@platformik/runtime-fastify-ts'
import { Metadata, ServerError } from 'nice-grpc'
import { err, ok, type Result } from 'neverthrow'
import { match } from 'ts-pattern'
import { z } from 'zod'
import { WorkflowRunStatus, workflowRunStatusToJSON } from '@platformik/contracts-workflows-ts'
import type { WorkflowsClient } from '../container'
import { publicRouteConfig } from '../ops/http/auth'

const AUTH_CONTEXT_METADATA_KEY = 'x-platformik-auth-context'

type AuthError = { type: 'missing_authorization' } | { type: 'invalid_session'; message: string }

const resolveSessionUser = async (
  iam: IamModule,
  authHeader: string | undefined,
): Promise<Result<SessionUser, AuthError>> => {
  if (!authHeader) {
    return err({ type: 'missing_authorization' })
  }

  const signedToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader
  const result = await iam.auth.getSession(
    new Headers({ cookie: `better-auth.session_token=${signedToken}` }),
  )

  if (result.isErr()) {
    return err({ type: 'invalid_session', message: 'Session validation failed' })
  }

  if (!result.value.payload) {
    return err({ type: 'invalid_session', message: 'No active session' })
  }

  return ok(result.value.payload.user)
}

const buildAuthContext = (user: SessionUser): AuthContext => ({
  actor: { service: 'api-platform' },
  subject: {
    userId: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
  },
})

const buildAuthMetadata = (authContext: AuthContext): Metadata =>
  Metadata({ [AUTH_CONTEXT_METADATA_KEY]: JSON.stringify(authContext) })

const mapAuthError = (error: AuthError): { status: 401; code: string; message: string } =>
  match(error)
    .with({ type: 'missing_authorization' }, () => ({
      status: 401 as const,
      code: 'UNAUTHENTICATED',
      message: 'Missing authorization header',
    }))
    .with({ type: 'invalid_session' }, (e) => ({
      status: 401 as const,
      code: 'UNAUTHENTICATED',
      message: e.message,
    }))
    .exhaustive()

const mapGrpcError = (
  error: unknown,
): { status: 400 | 401 | 403 | 404 | 500; code: string; message: string } => {
  if (error instanceof ServerError) {
    const status =
      error.code === 5
        ? (404 as const)
        : error.code === 7
          ? (403 as const)
          : error.code === 16
            ? (401 as const)
            : error.code === 3
              ? (400 as const)
              : (500 as const)

    return {
      status,
      code: error.code.toString(),
      message: error.details,
    }
  }

  return { status: 500, code: 'INTERNAL', message: String(error) }
}

const startWorkflowBodySchema = z.object({
  workflowId: z.string().min(1),
})

const submitAnswerBodySchema = z.object({
  optionId: z.string().optional(),
  rawInput: z.string().optional(),
})
const workflowRunIdParamsSchema = z.object({
  id: z.string().min(1),
})
const workflowRunViewQuerySchema = z.object({
  afterId: z.string().min(1).optional(),
})
const workflowsErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
})
const listWorkflowsResponseSchema = z.object({
  workflows: z.array(z.unknown()),
})
const startWorkflowResponseSchema = z.object({
  workflowRunId: z.string().optional(),
  conversationId: z.string().optional(),
  temporalWorkflowId: z.string().optional(),
})
const workflowRunViewResponseSchema = z.object({
  conversationId: z.string().nullable(),
  status: z.string(),
  currentNodeId: z.string().nullable(),
  revision: z.number(),
  lastMessageId: z.string().nullable(),
  messages: z.array(z.unknown()),
  pendingInput: z.unknown().nullable(),
})
const submitAnswerResponseSchema = z.object({
  ok: z.literal(true),
})
const workflowEventsResponseSchema = z.any()
const notAcceptableStatusCode = 406 as const

export const registerWorkflowRoutes = async (
  server: FastifyInstance,
  options: { iam: IamModule; workflowsClient: WorkflowsClient },
): Promise<void> => {
  const { iam, workflowsClient } = options

  // GET /api/v1/workflows
  server.get(
    '/api/v1/workflows',
    {
      config: publicRouteConfig,
      schema: {
        response: {
          200: listWorkflowsResponseSchema,
          400: workflowsErrorResponseSchema,
          401: workflowsErrorResponseSchema,
          403: workflowsErrorResponseSchema,
          404: workflowsErrorResponseSchema,
          500: workflowsErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userResult = await resolveSessionUser(iam, request.headers.authorization)
      if (userResult.isErr()) {
        const mapped = mapAuthError(userResult.error)

        return reply.code(mapped.status).send({ error: { code: mapped.code, message: mapped.message } })
      }

      const metadata = buildAuthMetadata(buildAuthContext(userResult.value))

      try {
        const response = await workflowsClient.listWorkflows({}, { metadata })

        return reply.send({ workflows: response.workflows })
      } catch (error) {
        const mapped = mapGrpcError(error)

        return reply.code(mapped.status).send({ error: { code: mapped.code, message: mapped.message } })
      }
    },
  )

  // POST /api/v1/workflows/runs
  server.post(
    '/api/v1/workflows/runs',
    {
      config: publicRouteConfig,
      attachValidation: true,
      schema: {
        body: startWorkflowBodySchema,
        response: {
          200: startWorkflowResponseSchema,
          400: workflowsErrorResponseSchema,
          401: workflowsErrorResponseSchema,
          403: workflowsErrorResponseSchema,
          404: workflowsErrorResponseSchema,
          500: workflowsErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userResult = await resolveSessionUser(iam, request.headers.authorization)
      if (userResult.isErr()) {
        const mapped = mapAuthError(userResult.error)

        return reply.code(mapped.status).send({ error: { code: mapped.code, message: mapped.message } })
      }

      if (request.validationError) {
        return reply.code(400).send({ error: { code: 'INVALID_ARGUMENT', message: 'Invalid request body' } })
      }

      const body = startWorkflowBodySchema.parse(request.body)
      const metadata = buildAuthMetadata(buildAuthContext(userResult.value))

      try {
        const response = await workflowsClient.startWorkflow(
          { workflowId: { value: body.workflowId } },
          { metadata },
        )

        return reply.send({
          workflowRunId: response.workflowRunId?.value,
          conversationId: response.conversationId?.value,
          temporalWorkflowId: response.temporalWorkflowId,
        })
      } catch (error) {
        const mapped = mapGrpcError(error)

        return reply.code(mapped.status).send({ error: { code: mapped.code, message: mapped.message } })
      }
    },
  )

  // GET /api/v1/workflows/runs/:id
  server.get<{ Params: { id: string }; Querystring: { afterId?: string } }>(
    '/api/v1/workflows/runs/:id',
    {
      config: publicRouteConfig,
      attachValidation: true,
      schema: {
        params: workflowRunIdParamsSchema,
        querystring: workflowRunViewQuerySchema,
        response: {
          200: workflowRunViewResponseSchema,
          400: workflowsErrorResponseSchema,
          401: workflowsErrorResponseSchema,
          403: workflowsErrorResponseSchema,
          404: workflowsErrorResponseSchema,
          500: workflowsErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userResult = await resolveSessionUser(iam, request.headers.authorization)
      if (userResult.isErr()) {
        const mapped = mapAuthError(userResult.error)

        return reply.code(mapped.status).send({ error: { code: mapped.code, message: mapped.message } })
      }

      if (request.validationError) {
        return reply
          .code(400)
          .send({ error: { code: 'INVALID_ARGUMENT', message: 'Invalid request params' } })
      }

      const runId = request.params.id
      const afterId = request.query.afterId
      const metadata = buildAuthMetadata(buildAuthContext(userResult.value))

      try {
        const grpcRequest: Record<string, unknown> = { workflowRunId: { value: runId } }
        if (afterId) {
          grpcRequest.afterId = { value: afterId }
        }

        const response = await workflowsClient.getWorkflowRunView(grpcRequest, { metadata })

        return reply.send({
          conversationId: response.conversationId?.value ?? null,
          status: workflowRunStatusToJSON(response.status),
          currentNodeId: response.currentNodeId ?? null,
          revision: response.revision,
          lastMessageId: response.lastMessageId?.value ?? null,
          messages: response.messages,
          pendingInput: response.pendingInput ?? null,
        })
      } catch (error) {
        const mapped = mapGrpcError(error)

        return reply.code(mapped.status).send({ error: { code: mapped.code, message: mapped.message } })
      }
    },
  )

  // POST /api/v1/workflows/runs/:id/answer
  server.post<{ Params: { id: string } }>(
    '/api/v1/workflows/runs/:id/answer',
    {
      config: publicRouteConfig,
      attachValidation: true,
      schema: {
        params: workflowRunIdParamsSchema,
        body: submitAnswerBodySchema,
        response: {
          200: submitAnswerResponseSchema,
          400: workflowsErrorResponseSchema,
          401: workflowsErrorResponseSchema,
          403: workflowsErrorResponseSchema,
          404: workflowsErrorResponseSchema,
          500: workflowsErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userResult = await resolveSessionUser(iam, request.headers.authorization)
      if (userResult.isErr()) {
        const mapped = mapAuthError(userResult.error)

        return reply.code(mapped.status).send({ error: { code: mapped.code, message: mapped.message } })
      }

      if (request.validationError) {
        return reply.code(400).send({ error: { code: 'INVALID_ARGUMENT', message: 'Invalid request body' } })
      }

      const runId = request.params.id
      const body = submitAnswerBodySchema.parse(request.body)
      const metadata = buildAuthMetadata(buildAuthContext(userResult.value))

      const selectOption: Record<string, string> = {}
      if (body.optionId) {
        selectOption.optionId = body.optionId
      } else if (body.rawInput) {
        selectOption.rawInput = body.rawInput
      }

      try {
        await workflowsClient.submitAnswer({ workflowRunId: { value: runId }, selectOption }, { metadata })

        return reply.send({ ok: true })
      } catch (error) {
        const mapped = mapGrpcError(error)

        return reply.code(mapped.status).send({ error: { code: mapped.code, message: mapped.message } })
      }
    },
  )

  // GET /api/v1/workflows/runs/:id/events — SSE
  server.get<{ Params: { id: string }; Querystring: { afterId?: string } }>(
    '/api/v1/workflows/runs/:id/events',
    {
      config: publicRouteConfig,
      sse: true,
      attachValidation: true,
      schema: {
        params: workflowRunIdParamsSchema,
        querystring: workflowRunViewQuerySchema,
        response: {
          200: workflowEventsResponseSchema,
          400: workflowsErrorResponseSchema,
          401: workflowsErrorResponseSchema,
          403: workflowsErrorResponseSchema,
          404: workflowsErrorResponseSchema,
          406: workflowsErrorResponseSchema,
          500: workflowsErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (!request.headers.accept?.includes('text/event-stream')) {
        return reply
          .code(notAcceptableStatusCode)
          .send({ error: { code: 'NOT_ACCEPTABLE', message: 'Expected Accept: text/event-stream' } })
      }

      const userResult = await resolveSessionUser(iam, request.headers.authorization)
      if (userResult.isErr()) {
        const mapped = mapAuthError(userResult.error)

        return reply.code(mapped.status).send({ error: { code: mapped.code, message: mapped.message } })
      }

      if (request.validationError) {
        return reply
          .code(400)
          .send({ error: { code: 'INVALID_ARGUMENT', message: 'Invalid request params' } })
      }

      const runId = request.params.id
      const afterId = request.query.afterId ?? undefined
      const metadata = buildAuthMetadata(buildAuthContext(userResult.value))

      reply.header('cache-control', 'no-cache')
      reply.sse.keepAlive()

      let isConnected = true
      reply.sse.onClose(() => {
        isConnected = false
      })

      await reply.sse.send(
        streamWorkflowEvents(workflowsClient, { runId, afterId, metadata, isConnected: () => isConnected }),
      )
    },
  )
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const streamWorkflowEvents = async function* (
  workflowsClient: WorkflowsClient,
  context: { runId: string; afterId: string | undefined; metadata: Metadata; isConnected: () => boolean },
): AsyncGenerator<SSEMessage> {
  let lastMessageId = context.afterId
  let lastRevision = -1
  let lastStatus = ''
  let lastPendingInputJson = ''

  while (context.isConnected()) {
    try {
      const grpcRequest: Record<string, unknown> = { workflowRunId: { value: context.runId } }
      if (lastMessageId) {
        grpcRequest.afterId = { value: lastMessageId }
      }

      const view = await workflowsClient.getWorkflowRunView(grpcRequest, { metadata: context.metadata })

      for (const message of view.messages) {
        yield { event: 'message', data: message }
      }

      if (view.lastMessageId?.value) {
        lastMessageId = view.lastMessageId.value
      }

      const currentStatus = workflowRunStatusToJSON(view.status)
      const currentRevision = view.revision
      if (currentRevision !== lastRevision || currentStatus !== lastStatus) {
        lastRevision = currentRevision
        lastStatus = currentStatus
        yield {
          event: 'status',
          data: {
            status: currentStatus,
            revision: view.revision,
            currentNodeId: view.currentNodeId ?? null,
          },
        }
      }

      const pendingInputJson = view.pendingInput ? JSON.stringify(view.pendingInput) : ''
      if (pendingInputJson && pendingInputJson !== lastPendingInputJson) {
        lastPendingInputJson = pendingInputJson
        yield { event: 'pending_input', data: view.pendingInput }
      } else if (!pendingInputJson && lastPendingInputJson) {
        lastPendingInputJson = ''
        yield { event: 'pending_input', data: null }
      }

      if (
        view.status === WorkflowRunStatus.WORKFLOW_RUN_STATUS_COMPLETED ||
        view.status === WorkflowRunStatus.WORKFLOW_RUN_STATUS_FAILED
      ) {
        if (lastPendingInputJson) {
          lastPendingInputJson = ''
          yield { event: 'pending_input', data: null }
        }
        break
      }

      yield { event: 'heartbeat', data: {} }
      await sleep(1000)
    } catch (error) {
      if (!context.isConnected()) break

      yield { event: 'error', data: { message: String(error) } }
      await sleep(2000)
    }
  }
}
