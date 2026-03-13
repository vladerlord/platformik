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
import type { Channel } from 'nice-grpc'
import { createChannel, createClient } from 'nice-grpc'
import { ENV } from './config'
import { resolveAppRateLimitConfig } from './config/rate-limit'
import { registerAuthGuard } from './ops/http/auth'
import { registerAiProvidersRoutes } from './routes/ai-providers'
import { authWriteRoutePaths, registerAuthRoutes } from './routes/auth'
import { registerCliAuthRoutes } from './routes/cli-auth'
import { registerWorkflowRoutes } from './routes/workflows'

export type WorkflowsClient = ReturnType<typeof createClient<typeof WorkflowsServiceDefinition>>

export type Container = {
  server: FastifyInstance
  logger: Logger
  iam: IamModule
  workflowsClient: WorkflowsClient
}

export async function build(): Promise<Container> {
  const rateLimitConfig = resolveAppRateLimitConfig(ENV.NODE_ENV)
  const logger = createPinoLogger({ level: 'info', name: 'api-platform' })
  const server = createFastifyServer({ logger })
  const pool = createPgPool(ENV.IAM_DATABASE_URL)
  const iamDb = new Kysely<IamDatabase>({
    dialect: new PostgresDialect({ pool }),
  })

  const iam = createIamModule({
    db: iamDb,
    baseUrl: ENV.AUTH_BASE_URL,
    authSecret: ENV.AUTH_SECRET,
    trustedOrigins: [ENV.CLIENT_ORIGIN],
  })

  const channel: Channel = createChannel(ENV.WORKFLOWS_GRPC_ADDRESS)
  const workflowsClient = createClient(WorkflowsServiceDefinition, channel)

  server.addHook('onClose', async () => {
    channel.close()
    await iamDb.destroy()
  })

  await server.register(cors, {
    origin: [ENV.CLIENT_ORIGIN],
    credentials: true,
  })

  await server.register(rateLimit, { global: false })
  await server.register(fastifySSE)

  const globalRateLimitPreHandler = server.rateLimit(rateLimitConfig.global)

  server.addHook('preHandler', async (request, reply) => {
    const routeUrl = request.routeOptions.url ?? ''

    if (authWriteRoutePaths.has(routeUrl)) return

    await globalRateLimitPreHandler.call(server, request, reply)
  })

  await registerAuthGuard(server, { iam })
  await registerAuthRoutes(server, {
    iam,
    authWriteRateLimit: rateLimitConfig.authWrite,
    trustedOrigins: [ENV.CLIENT_ORIGIN],
  })
  await registerAiProvidersRoutes(server)
  await registerCliAuthRoutes(server, { iam })
  await registerWorkflowRoutes(server, { iam, workflowsClient })

  return { server, logger, iam, workflowsClient }
}
