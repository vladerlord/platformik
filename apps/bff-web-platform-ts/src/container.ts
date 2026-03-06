import { createPinoLogger } from '@platformik/runtime-pino-ts'
import { createFastifyServer } from '@platformik/runtime-fastify-ts'
import type { FastifyInstance } from 'fastify'
import type { Logger } from '@platformik/lib-logger-ts'

export type AppContainer = {
  server: FastifyInstance
  logger: Logger
}

export const buildContainer = (): AppContainer => {
  const logger = createPinoLogger({ level: 'info', name: 'bff-web-platform' })
  const server = createFastifyServer({ logger })

  return { server, logger }
}
