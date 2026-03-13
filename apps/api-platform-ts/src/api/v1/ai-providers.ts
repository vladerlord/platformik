import type { FastifyInstance } from '@platformik/runtime-fastify-ts'
import { z } from 'zod'

export const registerAiProvidersRoutes = async (server: FastifyInstance): Promise<void> => {
  const aiProvidersResponseSchema = z.object({
    providers: z.array(
      z.object({
        name: z.string(),
        status: z.enum(['active', 'disabled']),
      }),
    ),
  })

  server.get(
    '/api/v1/ai-providers',
    {
      schema: {
        response: {
          200: aiProvidersResponseSchema,
        },
      },
    },
    async () => {
      return { providers: [] }
    },
  )
}
