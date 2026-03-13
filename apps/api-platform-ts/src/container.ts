import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import fastifySSE from '@fastify/sse'
import { WorkflowsServiceDefinition } from '@platformik/contracts-workflows-ts'
import type { Logger } from '@platformik/lib-logger-ts'
import { createIamModule } from '@platformik/module-iam-ts'
import type { IamDatabase, IamModule } from '@platformik/module-iam-ts/contracts'
import type { FastifyInstance } from '@platformik/runtime-fastify-ts'
import { createFastifyServer } from '@platformik/runtime-fastify-ts'
import { createPgPool } from '@platformik/runtime-pg-ts'
import { createPinoLogger } from '@platformik/runtime-pino-ts'
import { Kysely, PostgresDialect } from 'kysely'
import Redis from 'ioredis'
import type { Channel } from 'nice-grpc'
import { createChannel, createClient } from 'nice-grpc'
import type { ApiEnv } from './config/env'
import { createWorkflowRunNotifier } from './features/workflows/workflow-run-notifier'
import type { WorkflowRunNotifier } from './features/workflows/workflow-run-notifier.types'
import { createEventBusListener } from './ops/event-bus/event-bus'
import type { EventBusListener } from './ops/event-bus/event-bus.types'
import { resolveAppRateLimitConfig, type AppRateLimitConfigOverride } from './config/rate-limit'
import { resolveEventBusPolicy } from './config/event-bus'
import { resolveWorkflowStreamPolicy } from './config/workflows-stream'
import { registerAuthGuard } from './ops/http/auth'
import { registerAiProvidersRoutes } from './api/v1/ai-providers'
import { registerAuthRoutes, registerCliAuthRoutes } from './api/v1/auth'
import { registerWorkflowRoutes } from './api/v1/workflows'

export type WorkflowsClient = ReturnType<typeof createClient<typeof WorkflowsServiceDefinition>>

export type Container = {
  server: FastifyInstance
  logger: Logger
  iam: IamModule
  workflowsClient: WorkflowsClient
  eventBusListener: EventBusListener
  workflowRunNotifier: WorkflowRunNotifier
}

export type ContainerRouteDeps = {
  env: ApiEnv
  server: FastifyInstance
  iam: IamModule
  workflowsClient: WorkflowsClient
  workflowRunNotifier: WorkflowRunNotifier
  rateLimitConfigOverride?: AppRateLimitConfigOverride
}

export const registerContainerRoutes = async (deps: ContainerRouteDeps): Promise<void> => {
  const { env, server, iam, workflowsClient, workflowRunNotifier, rateLimitConfigOverride } = deps
  const rateLimitConfig = resolveAppRateLimitConfig(env.NODE_ENV, rateLimitConfigOverride)
  const workflowStreamPolicy = resolveWorkflowStreamPolicy(env.NODE_ENV)
  await server.register(cors, {
    origin: [env.CLIENT_ORIGIN],
    credentials: true,
  })

  await server.register(rateLimit, { global: false })
  await server.register(fastifySSE)

  const globalRateLimitPreHandler = server.rateLimit(rateLimitConfig.global)

  server.addHook('preHandler', async (request, reply) => {
    if (request.routeOptions.config.skipGlobalRateLimit === true) return

    await globalRateLimitPreHandler.call(server, request, reply)
  })

  await registerAuthGuard(server, { iam })
  await registerAuthRoutes(server, {
    iam,
    authWriteRateLimit: rateLimitConfig.authWrite,
    trustedOrigins: [env.CLIENT_ORIGIN],
  })
  await registerAiProvidersRoutes(server)
  await registerCliAuthRoutes(server, { iam })
  await registerWorkflowRoutes(server, {
    iam,
    workflowsClient,
    workflowRunNotifier,
    policy: workflowStreamPolicy,
  })
}

export async function build(env: ApiEnv): Promise<Container> {
  const eventBusPolicy = resolveEventBusPolicy(env.NODE_ENV)
  const logger = createPinoLogger({ level: 'info', name: 'api-platform' })
  const server = createFastifyServer({ logger })

  const iamDb = new Kysely<IamDatabase>({
    dialect: new PostgresDialect({ pool: createPgPool(env.IAM_DATABASE_URL) }),
  })
  const iam = createIamModule({
    db: iamDb,
    baseUrl: env.AUTH_BASE_URL,
    authSecret: env.AUTH_SECRET,
    trustedOrigins: [env.CLIENT_ORIGIN],
  })

  const channel: Channel = createChannel(env.WORKFLOWS_GRPC_ADDRESS)
  const workflowsClient = createClient(WorkflowsServiceDefinition, channel)

  const workflowsRedis = new Redis(env.WORKFLOWS_REDIS_URL)
  const eventBusListener = createEventBusListener({ redis: workflowsRedis, logger, policy: eventBusPolicy })
  const workflowRunNotifier = createWorkflowRunNotifier({ eventBusListener, logger })

  server.addHook('onClose', async () => {
    await workflowRunNotifier.close()
    await eventBusListener.close()
    workflowsRedis.disconnect()
    channel.close()
    await iamDb.destroy()
  })

  await registerContainerRoutes({
    env,
    server,
    iam,
    workflowsClient,
    workflowRunNotifier,
  })

  return { server, logger, iam, workflowsClient, eventBusListener, workflowRunNotifier }
}
