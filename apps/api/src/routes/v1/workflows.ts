import type { IamModule } from '@platformik/module-iam/contracts'
import type { FastifyInstance } from '../../ops/fastify/fastify'
import type { FastifyReply } from 'fastify'
import type { WorkflowRunNotifier } from '../../features/workflows/workflow-run-notifier.types'
import type { WorkflowStreamPolicy } from '../../config/workflows-stream'
import type { WorkflowsService } from '../../application/workflows/workflows-service'
import { WorkflowsServiceError } from '../../application/workflows/workflows-service'
import { publicRouteConfig } from '../../ops/http/auth'
import {
  listWorkflowsResponseSchema,
  startWorkflowBodySchema,
  startWorkflowResponseSchema,
  submitAnswerBodySchema,
  submitAnswerResponseSchema,
  workflowEventsResponseSchema,
  workflowsErrorResponseSchema,
  workflowRunIdParamsSchema,
  workflowRunViewQuerySchema,
  workflowRunViewResponseSchema,
  type StartWorkflowBody,
  type SubmitAnswerBody,
  type WorkflowRunIdParams,
  type WorkflowRunViewQuery,
} from './workflows.types'
import { mapWorkflowAuthError, resolveWorkflowAuthMetadata } from '../../application/workflows/workflows-auth'
import { streamWorkflowEvents } from '../../application/workflows/workflows-stream'

const notAcceptableStatusCode = 406 as const

const sendWorkflowError = (reply: FastifyReply, status: number, code: string, message: string) =>
  reply.code(status).send({ error: { code, message } })

export const registerWorkflowRoutes = async (
  server: FastifyInstance,
  options: {
    iam: IamModule
    workflowsService: WorkflowsService
    workflowRunNotifier: WorkflowRunNotifier
    policy: WorkflowStreamPolicy
  },
): Promise<void> => {
  const { iam, workflowsService, workflowRunNotifier, policy } = options

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
      const authResult = await resolveWorkflowAuthMetadata(iam, request.headers.authorization)
      if (authResult.isErr()) {
        const mapped = mapWorkflowAuthError(authResult.error)

        return sendWorkflowError(reply, mapped.status, mapped.code, mapped.message)
      }

      try {
        const response = await workflowsService.listWorkflows({ userId: authResult.value.userId })

        return reply.send({ workflows: response.workflows })
      } catch (error) {
        const mapped =
          error instanceof WorkflowsServiceError
            ? error
            : new WorkflowsServiceError(500, 'INTERNAL', String(error))

        return sendWorkflowError(reply, mapped.status, mapped.code, mapped.message)
      }
    },
  )

  server.post<{ Body: StartWorkflowBody }>(
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
      const authResult = await resolveWorkflowAuthMetadata(iam, request.headers.authorization)
      if (authResult.isErr()) {
        const mapped = mapWorkflowAuthError(authResult.error)

        return sendWorkflowError(reply, mapped.status, mapped.code, mapped.message)
      }

      if (request.validationError) {
        return sendWorkflowError(reply, 400, 'INVALID_ARGUMENT', 'Invalid request body')
      }

      try {
        const response = await workflowsService.startWorkflow({
          workflowId: request.body.workflowId,
          context: { userId: authResult.value.userId },
        })

        return reply.send({
          workflowRunId: response.workflowRunId?.value,
          conversationId: response.conversationId?.value,
          temporalWorkflowId: response.temporalWorkflowId,
        })
      } catch (error) {
        const mapped =
          error instanceof WorkflowsServiceError
            ? error
            : new WorkflowsServiceError(500, 'INTERNAL', String(error))

        return sendWorkflowError(reply, mapped.status, mapped.code, mapped.message)
      }
    },
  )

  server.get<{ Params: WorkflowRunIdParams; Querystring: WorkflowRunViewQuery }>(
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
      const authResult = await resolveWorkflowAuthMetadata(iam, request.headers.authorization)
      if (authResult.isErr()) {
        const mapped = mapWorkflowAuthError(authResult.error)

        return sendWorkflowError(reply, mapped.status, mapped.code, mapped.message)
      }

      if (request.validationError) {
        return sendWorkflowError(reply, 400, 'INVALID_ARGUMENT', 'Invalid request params')
      }

      try {
        const getRunViewParams = {
          workflowRunId: request.params.id,
          context: { userId: authResult.value.userId },
          ...(request.query.afterId !== undefined ? { afterId: request.query.afterId } : {}),
        }
        const response = await workflowsService.getWorkflowRunView(getRunViewParams)

        return reply.send({
          conversationId: response.conversationId?.value ?? null,
          status: response.status,
          currentNodeId: response.currentNodeId ?? null,
          revision: response.revision,
          lastMessageId: response.lastMessageId?.value ?? null,
          messages: response.messages,
          pendingInput: response.pendingInput ?? null,
        })
      } catch (error) {
        const mapped =
          error instanceof WorkflowsServiceError
            ? error
            : new WorkflowsServiceError(500, 'INTERNAL', String(error))

        return sendWorkflowError(reply, mapped.status, mapped.code, mapped.message)
      }
    },
  )

  server.post<{ Params: WorkflowRunIdParams; Body: SubmitAnswerBody }>(
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
      const authResult = await resolveWorkflowAuthMetadata(iam, request.headers.authorization)
      if (authResult.isErr()) {
        const mapped = mapWorkflowAuthError(authResult.error)

        return sendWorkflowError(reply, mapped.status, mapped.code, mapped.message)
      }

      if (request.validationError) {
        return sendWorkflowError(reply, 400, 'INVALID_ARGUMENT', 'Invalid request body')
      }

      try {
        const selectOption =
          request.body.optionId !== undefined
            ? { optionId: request.body.optionId }
            : { rawInput: request.body.rawInput ?? '' }
        await workflowsService.submitAnswer({
          workflowRunId: request.params.id,
          selectOption,
          context: { userId: authResult.value.userId },
        })

        return reply.send({ ok: true })
      } catch (error) {
        const mapped =
          error instanceof WorkflowsServiceError
            ? error
            : new WorkflowsServiceError(500, 'INTERNAL', String(error))

        return sendWorkflowError(reply, mapped.status, mapped.code, mapped.message)
      }
    },
  )

  server.get<{ Params: WorkflowRunIdParams; Querystring: WorkflowRunViewQuery }>(
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
          503: workflowsErrorResponseSchema,
          500: workflowsErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (!request.headers.accept?.includes('text/event-stream')) {
        return sendWorkflowError(
          reply,
          notAcceptableStatusCode,
          'NOT_ACCEPTABLE',
          'Expected Accept: text/event-stream',
        )
      }

      const authResult = await resolveWorkflowAuthMetadata(iam, request.headers.authorization)
      if (authResult.isErr()) {
        const mapped = mapWorkflowAuthError(authResult.error)

        return sendWorkflowError(reply, mapped.status, mapped.code, mapped.message)
      }

      if (request.validationError) {
        return sendWorkflowError(reply, 400, 'INVALID_ARGUMENT', 'Invalid request params')
      }

      if (!workflowRunNotifier.isReady()) {
        return sendWorkflowError(reply, 503, 'SERVICE_UNAVAILABLE', 'Workflow event stream is unavailable')
      }

      reply.header('cache-control', 'no-cache')
      reply.sse.keepAlive()

      let isConnected = true
      reply.sse.onClose(() => {
        isConnected = false
      })

      await reply.sse.send(
        streamWorkflowEvents({
          runId: request.params.id,
          afterId: request.query.afterId ?? undefined,
          authContext: { userId: authResult.value.userId },
          workflowsService,
          workflowRunNotifier,
          heartbeatIntervalMs: policy.heartbeatIntervalMs,
          isConnected: () => isConnected,
        }),
      )
    },
  )
}
