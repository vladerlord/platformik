import type { FastifyInstance } from '@platformik/runtime-fastify-ts'
import { z } from 'zod'

export const registerAiProvidersRoutes = async (server: FastifyInstance): Promise<void> => {
  server.get(
    '/ai-providers',
    {
      schema: {
        response: {
          200: z.object({}),
        },
      },
    },
    async () => {
      return {}
    },
  )
}
