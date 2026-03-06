import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { Kysely, PostgresDialect } from 'kysely'
import { createIamModule } from '@platformik/module-iam-ts'
import type { IamDatabase, IamModule } from '@platformik/module-iam-ts/contracts'
import { createPinoLogger } from '@platformik/runtime-pino-ts'
import { createPgPool } from '@platformik/runtime-pg-ts'
import { createFastifyServer } from '@platformik/runtime-fastify-ts'
import type { FastifyInstance } from '@platformik/runtime-fastify-ts'
import type { Logger } from '@platformik/lib-logger-ts'
import { authWriteRoutePaths, registerAuthRoutes } from './routes/auth'
import z from 'zod'
import { registerAiProvidersRoutes } from './routes/ai-providers'
import { nodeEnvSchema } from './config/env'
import { resolveAppRateLimitConfig } from './config/rate-limit'
import { registerAuthGuard } from './ops/http/auth'

const envSchema = z.object({
  IAM_DATABASE_URL: z.string().nonempty(),
  AUTH_BASE_URL: z.string().nonempty(),
  AUTH_SECRET: z.string().nonempty(),
  CLIENT_ORIGIN: z.string().nonempty(),
  NODE_ENV: nodeEnvSchema,
})
export const ENV = envSchema.parse(process.env)

export type AppContainer = {
  server: FastifyInstance
  logger: Logger
  iam: IamModule
}

export const buildContainer = async (): Promise<AppContainer> => {
  const rateLimitConfig = resolveAppRateLimitConfig(ENV.NODE_ENV)
  const logger = createPinoLogger({ level: 'info', name: 'bff-web-platform' })
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

  server.addHook('onClose', async () => {
    await iamDb.destroy()
  })

  await server.register(cors, {
    origin: [ENV.CLIENT_ORIGIN],
    credentials: true,
  })

  await server.register(rateLimit, { global: false })

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

  return { server, logger, iam }
}
