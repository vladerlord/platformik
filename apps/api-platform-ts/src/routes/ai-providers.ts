import type { FastifyInstance } from '@platformik/runtime-fastify-ts'
import { z } from 'zod'

export const registerAiProvidersRoutes = async (server: FastifyInstance): Promise<void> => {
  server.get(
    '/api/v1/ai-providers',
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
