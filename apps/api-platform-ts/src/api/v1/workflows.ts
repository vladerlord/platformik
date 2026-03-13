import type { IamModule } from '@platformik/module-iam-ts/contracts'
import type { FastifyInstance } from '@platformik/runtime-fastify-ts'
import { workflowRunStatusToJSON } from '@platformik/contracts-workflows-ts'
import type { FastifyReply } from 'fastify'
import type { WorkflowsClient } from '../../container'
import type { WorkflowRunNotifier } from '../../features/workflows/workflow-run-notifier.types'
import type { WorkflowStreamPolicy } from '../../config/workflows-stream'
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
import { buildGetRunViewRequest, buildSubmitAnswerRequest } from '../../application/workflows/workflows-grpc'
import { mapWorkflowAuthError, resolveWorkflowAuthMetadata } from '../../application/workflows/workflows-auth'
import { mapWorkflowsGrpcError } from '../../application/workflows/workflows-errors'
import { streamWorkflowEvents } from '../../application/workflows/workflows-stream'

const notAcceptableStatusCode = 406 as const

const sendWorkflowError = (reply: FastifyReply, status: number, code: string, message: string) =>
  reply.code(status).send({ error: { code, message } })

export const registerWorkflowRoutes = async (
  server: FastifyInstance,
  options: {
    iam: IamModule
    workflowsClient: WorkflowsClient
    workflowRunNotifier: WorkflowRunNotifier
    policy: WorkflowStreamPolicy
  },
): Promise<void> => {
  const { iam, workflowsClient, workflowRunNotifier, policy } = options

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
        const response = await workflowsClient.listWorkflows({}, { metadata: authResult.value })

        return reply.send({ workflows: response.workflows })
      } catch (error) {
        const mapped = mapWorkflowsGrpcError(error)

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
        const response = await workflowsClient.startWorkflow(
          { workflowId: { value: request.body.workflowId } },
          { metadata: authResult.value },
        )

        return reply.send({
          workflowRunId: response.workflowRunId?.value,
          conversationId: response.conversationId?.value,
          temporalWorkflowId: response.temporalWorkflowId,
        })
      } catch (error) {
        const mapped = mapWorkflowsGrpcError(error)

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
        const response = await workflowsClient.getWorkflowRunView(
          buildGetRunViewRequest(request.params.id, request.query.afterId),
          { metadata: authResult.value },
        )

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
        const mapped = mapWorkflowsGrpcError(error)

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
        await workflowsClient.submitAnswer(buildSubmitAnswerRequest(request.params.id, request.body), {
          metadata: authResult.value,
        })

        return reply.send({ ok: true })
      } catch (error) {
        const mapped = mapWorkflowsGrpcError(error)

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
          metadata: authResult.value,
          workflowsClient,
          workflowRunNotifier,
          heartbeatIntervalMs: policy.heartbeatIntervalMs,
          isConnected: () => isConnected,
        }),
      )
    },
  )
}
