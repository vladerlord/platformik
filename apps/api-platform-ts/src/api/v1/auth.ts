import type { IamAuthSuccess, IamModule } from '@platformik/module-iam-ts/contracts'
import {
  sessionResultSchema,
  signInBodySchema,
  signInSuccessPayloadSchema,
  signOutSuccessPayloadSchema,
  signUpBodySchema,
  signUpSuccessPayloadSchema,
} from '@platformik/module-iam-ts/contracts'
import type { FastifyInstance } from '@platformik/runtime-fastify-ts'
import type { FastifyReply } from 'fastify'
import { match } from 'ts-pattern'
import { z } from 'zod'
import type { RateLimitRule } from '../../config/rate-limit'
import { publicRouteConfig } from '../../ops/http/auth'
import { applyHeadersToReply, getSetCookieHeaders, parseHeaders } from '../../ops/http/headers'
import { hasTrustedOrigin } from '../../ops/http/origin'
import {
  AUTHENTICATION_FAILED_MESSAGE,
  authenticationFailedResponseSchema,
  FORBIDDEN_MESSAGE,
  forbiddenResponseSchema,
  INTERNAL_SERVER_ERROR_MESSAGE,
  internalServerErrorResponseSchema,
  INVALID_REQUEST_MESSAGE,
  invalidRequestResponseSchema,
  SIGN_UP_FAILED_MESSAGE,
  signUpFailedResponseSchema,
  UNAUTHORIZED_MESSAGE,
  unauthorizedResponseSchema,
} from '../../ops/http/response-schemas'

const sendIamResponse = async <TPayload>(
  reply: FastifyReply,
  response: IamAuthSuccess<TPayload>,
): Promise<FastifyReply> => {
  applyHeadersToReply(reply, response.headers)

  return reply.code(response.status).send(response.payload)
}

export type AuthWriteRateLimit = RateLimitRule
export const authWriteRouteConfig = {
  ...publicRouteConfig,
  skipGlobalRateLimit: true,
}

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
  for (const setCookie of getSetCookieHeaders(responseHeaders)) {
    const tokenMatch = setCookie.match(/better-auth\.session_token=([^;,\s]+)/)
    if (tokenMatch?.[1]) {
      return decodeURIComponent(tokenMatch[1])
    }
  }

  return undefined
}

type SignUpBody = z.infer<typeof signUpBodySchema>
type SignInBody = z.infer<typeof signInBodySchema>
type LoginBody = z.infer<typeof loginBodySchema>

export const registerAuthRoutes = async (
  server: FastifyInstance,
  options: {
    iam: IamModule
    authWriteRateLimit: AuthWriteRateLimit
    trustedOrigins: string[]
  },
): Promise<void> => {
  const authWriteRateLimitPreHandler = server.rateLimit(options.authWriteRateLimit)

  server.post<{ Body: SignUpBody }>(
    '/api/v1/auth/sign-up',
    {
      config: authWriteRouteConfig,
      preHandler: authWriteRateLimitPreHandler,
      attachValidation: true,
      schema: {
        body: signUpBodySchema,
        response: {
          201: signUpSuccessPayloadSchema,
          400: z.union([invalidRequestResponseSchema, signUpFailedResponseSchema]),
          500: signUpFailedResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (request.validationError) {
        return reply.code(400).send({ message: INVALID_REQUEST_MESSAGE })
      }

      const result = await options.iam.auth.signUp(request.body, parseHeaders(request.headers))

      return await result.match(
        async (response) => await sendIamResponse(reply, response),
        (error) =>
          match(error)
            .with(
              { type: 'invalid_email' },
              { type: 'invalid_password' },
              { type: 'password_too_short' },
              { type: 'password_too_long' },
              { type: 'user_already_exists' },
              () => reply.code(400).send({ message: SIGN_UP_FAILED_MESSAGE }),
            )
            .with(
              { type: 'failed_to_create_user' },
              { type: 'failed_to_create_session' },
              { type: 'unexpected_error' },
              () => reply.code(500).send({ message: SIGN_UP_FAILED_MESSAGE }),
            )
            .exhaustive(),
      )
    },
  )

  server.post<{ Body: SignInBody }>(
    '/api/v1/auth/sign-in',
    {
      config: authWriteRouteConfig,
      preHandler: authWriteRateLimitPreHandler,
      attachValidation: true,
      schema: {
        body: signInBodySchema,
        response: {
          200: signInSuccessPayloadSchema,
          400: invalidRequestResponseSchema,
          401: authenticationFailedResponseSchema,
          500: internalServerErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (request.validationError) {
        return reply.code(400).send({ message: INVALID_REQUEST_MESSAGE })
      }

      const result = await options.iam.auth.signIn(request.body, parseHeaders(request.headers))

      return await result.match(
        async (response) => await sendIamResponse(reply, response),
        (error) =>
          match(error)
            .with({ type: 'invalid_email' }, () => reply.code(400).send({ message: INVALID_REQUEST_MESSAGE }))
            .with({ type: 'invalid_credentials' }, { type: 'email_not_verified' }, () =>
              reply.code(401).send({ message: AUTHENTICATION_FAILED_MESSAGE }),
            )
            .with({ type: 'failed_to_create_session' }, { type: 'unexpected_error' }, () =>
              reply.code(500).send({ message: INTERNAL_SERVER_ERROR_MESSAGE }),
            )
            .exhaustive(),
      )
    },
  )

  server.post(
    '/api/v1/auth/sign-out',
    {
      config: authWriteRouteConfig,
      preHandler: authWriteRateLimitPreHandler,
      schema: {
        response: {
          200: signOutSuccessPayloadSchema,
          403: forbiddenResponseSchema,
          500: internalServerErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (!hasTrustedOrigin(request, options.trustedOrigins)) {
        return reply.code(403).send({ message: FORBIDDEN_MESSAGE })
      }

      const result = await options.iam.auth.signOut(parseHeaders(request.headers))

      return await result.match(
        async (response) => await sendIamResponse(reply, response),
        (error) =>
          match(error)
            .with({ type: 'unexpected_error' }, () =>
              reply.code(500).send({ message: INTERNAL_SERVER_ERROR_MESSAGE }),
            )
            .exhaustive(),
      )
    },
  )

  server.get(
    '/api/v1/auth/session',
    {
      config: publicRouteConfig,
      schema: {
        response: {
          200: sessionResultSchema,
          401: unauthorizedResponseSchema,
          500: internalServerErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await options.iam.auth.getSession(parseHeaders(request.headers))

      return result.match(
        (response) => {
          applyHeadersToReply(reply, response.headers)

          return response.payload
            ? reply.code(200).send(response.payload)
            : reply.code(401).send({ message: UNAUTHORIZED_MESSAGE })
        },
        (error) =>
          match(error)
            .with({ type: 'unexpected_error' }, () =>
              reply.code(500).send({ message: INTERNAL_SERVER_ERROR_MESSAGE }),
            )
            .exhaustive(),
      )
    },
  )
}

export const registerCliAuthRoutes = async (
  server: FastifyInstance,
  options: { iam: IamModule },
): Promise<void> => {
  server.post<{ Body: LoginBody }>(
    '/api/v1/auth/login',
    {
      config: authWriteRouteConfig,
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

      const result = await options.iam.auth.signIn(
        { email: request.body.email, password: request.body.password },
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
