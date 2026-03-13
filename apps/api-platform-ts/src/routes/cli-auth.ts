import type { IamModule } from '@platformik/module-iam-ts/contracts'
import type { FastifyInstance } from '@platformik/runtime-fastify-ts'
import { match } from 'ts-pattern'
import { z } from 'zod'
import { publicRouteConfig } from '../ops/http/auth'

const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})
const loginSuccessResponseSchema = z.object({
  sessionToken: z.string().min(1),
})
const cliAuthErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
})

const extractSessionToken = (responseHeaders: Headers): string | undefined => {
  const setCookie = responseHeaders.get('set-cookie') ?? ''
  const tokenMatch = setCookie.match(/better-auth\.session_token=([^;,\s]+)/)

  return tokenMatch ? decodeURIComponent(tokenMatch[1]) : undefined
}

export const registerCliAuthRoutes = async (
  server: FastifyInstance,
  options: { iam: IamModule },
): Promise<void> => {
  server.post(
    '/api/v1/auth/login',
    {
      config: publicRouteConfig,
      attachValidation: true,
      schema: {
        body: loginBodySchema,
        response: {
          200: loginSuccessResponseSchema,
          400: cliAuthErrorResponseSchema,
          401: cliAuthErrorResponseSchema,
          403: cliAuthErrorResponseSchema,
          500: cliAuthErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (request.validationError) {
        return reply.code(400).send({ error: { code: 'INVALID_ARGUMENT', message: 'Invalid request body' } })
      }

      const body = loginBodySchema.parse(request.body)
      const result = await options.iam.auth.signIn(
        { email: body.email, password: body.password },
        new Headers(),
      )

      if (result.isErr()) {
        const mapped = match(result.error)
          .with({ type: 'invalid_credentials' }, () => ({
            status: 401 as const,
            code: 'UNAUTHENTICATED',
            message: 'Invalid credentials',
          }))
          .with({ type: 'invalid_email' }, () => ({
            status: 400 as const,
            code: 'INVALID_ARGUMENT',
            message: 'Invalid email',
          }))
          .with({ type: 'email_not_verified' }, () => ({
            status: 403 as const,
            code: 'PERMISSION_DENIED',
            message: 'Email not verified',
          }))
          .with({ type: 'failed_to_create_session' }, () => ({
            status: 500 as const,
            code: 'INTERNAL',
            message: 'Failed to create session',
          }))
          .with({ type: 'unexpected_error' }, (e) => ({
            status: 500 as const,
            code: 'INTERNAL',
            message: String(e.cause),
          }))
          .exhaustive()

        return reply.code(mapped.status).send({ error: { code: mapped.code, message: mapped.message } })
      }

      const token = extractSessionToken(result.value.headers)
      if (!token) {
        return reply
          .code(500)
          .send({ error: { code: 'INTERNAL', message: 'Failed to extract session token' } })
      }

      return reply.send({ sessionToken: token })
    },
  )
}
