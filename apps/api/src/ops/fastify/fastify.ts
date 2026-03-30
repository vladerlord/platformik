import Fastify, { type FastifyInstance } from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import type { Logger } from '@platformik/lib-logger'

export type FastifyServerConfig = {
  logger: Logger
}

export const createFastifyServer = (config: FastifyServerConfig): FastifyInstance => {
  const server = Fastify({ loggerInstance: config.logger as FastifyInstance['log'] })

  server.setValidatorCompiler(validatorCompiler)
  server.setSerializerCompiler(serializerCompiler)

  return server
}

export type { FastifyInstance }
