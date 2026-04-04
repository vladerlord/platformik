import { randomUUID } from 'node:crypto'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import fastifySSE from '@fastify/sse'
import type { Logger } from '@platformik/lib-logger'
import { createIamModule } from '@platformik/module-iam'
import type { IamDatabase, IamModule } from '@platformik/module-iam/contracts'
import { createWorkflowsModule } from '@platformik/module-workflows'
import type { WorkflowsDatabase } from '@platformik/module-workflows/contracts'
import { createPinoLogger } from '@platformik/lib-logger'
import { Client, Connection } from '@temporalio/client'
import { Kysely, PostgresDialect } from 'kysely'
import { connect } from 'nats'
import type { ApiEnv } from './config/env'
import { createWorkflowsService, type WorkflowsService } from './application/workflows/workflows-service'
import { createWorkflowRunNotifier } from './features/workflows/workflow-run-notifier'
import type { WorkflowRunNotifier } from './features/workflows/workflow-run-notifier.types'
import { createEventBusListener } from './ops/event-bus/event-bus'
import type { EventBusListener } from './ops/event-bus/event-bus.types'
import { resolveAppRateLimitConfig, type AppRateLimitConfigOverride } from './config/rate-limit'
import { resolveEventBusPolicy } from './config/event-bus'
import { resolveWorkflowStreamPolicy } from './config/workflows-stream'
import { registerAuthGuard } from './ops/http/auth'
import { createFastifyServer, type FastifyInstance } from './ops/fastify/fastify'
import { createPgPool } from './ops/pg/pg'
import { registerAiProvidersRoutes } from './routes/v1/ai-providers'
import { registerAuthRoutes, registerCliAuthRoutes } from './routes/v1/auth'
import { registerWorkflowRoutes } from './routes/v1/workflows'

export type Container = {
  server: FastifyInstance
  logger: Logger
  iam: IamModule
  workflowsService: WorkflowsService
  eventBusListener: EventBusListener
  workflowRunNotifier: WorkflowRunNotifier
}

export type ContainerRouteDeps = {
  env: ApiEnv
  server: FastifyInstance
  iam: IamModule
  workflowsService: WorkflowsService
  workflowRunNotifier: WorkflowRunNotifier
  rateLimitConfigOverride?: AppRateLimitConfigOverride
}

export const registerContainerRoutes = async (deps: ContainerRouteDeps): Promise<void> => {
  const { env, server, iam, workflowsService, workflowRunNotifier, rateLimitConfigOverride } = deps
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
    workflowsService,
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

  const workflowsDb = new Kysely<WorkflowsDatabase>({
    dialect: new PostgresDialect({ pool: createPgPool(env.WORKFLOWS_DATABASE_URL) }),
  })
  const workflows = createWorkflowsModule({ db: workflowsDb })
  const temporalConnection = await Connection.connect({ address: env.TEMPORAL_ADDRESS })
  const temporalClient = new Client({
    connection: temporalConnection,
    namespace: env.TEMPORAL_NAMESPACE,
  })
  const workflowsService = createWorkflowsService({
    workflows,
    workflowsDb,
    temporalClient,
    temporalTaskQueue: env.TEMPORAL_TASK_QUEUE,
  })

  const natsConnection = await connect({ servers: env.WORKFLOWS_NATS_URL })
  const eventBusListener = createEventBusListener({
    natsConnection,
    streamName: env.WORKFLOWS_NATS_STREAM,
    consumerName: `${env.WORKFLOWS_NATS_CONSUMER_PREFIX}-${randomUUID()}`,
    logger,
    policy: eventBusPolicy,
  })
  const workflowRunNotifier = createWorkflowRunNotifier({ eventBusListener })

  server.addHook('onClose', async () => {
    await workflowRunNotifier.close()
    await eventBusListener.close()
    await natsConnection.drain()
    await natsConnection.close()
    await temporalClient.connection.close()
    await workflowsDb.destroy()
    await iamDb.destroy()
  })

  await registerContainerRoutes({
    env,
    server,
    iam,
    workflowsService,
    workflowRunNotifier,
  })

  return { server, logger, iam, workflowsService, eventBusListener, workflowRunNotifier }
}
