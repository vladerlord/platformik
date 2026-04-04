import type { AuthSubject } from '../fastify/auth-context'
import type { IamModule } from '@platformik/module-iam/contracts'
import type { FastifyInstance } from '../fastify/fastify'
import type { FastifyContextConfig, FastifyReply, FastifyRequest } from 'fastify'
import { match } from 'ts-pattern'
import { applyHeadersToReply, parseHeaders } from './headers'
import { INTERNAL_SERVER_ERROR_MESSAGE, UNAUTHORIZED_MESSAGE } from './response-schemas'

export const requireUserSession =
  (iam: IamModule) =>
  async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const result = await iam.auth.getSession(parseHeaders(request.headers))

    await result.match(
      async (response) => {
        applyHeadersToReply(reply, response.headers)

        if (!response.payload) {
          await reply.code(401).send({ message: UNAUTHORIZED_MESSAGE })

          return
        }

        request.authSubject = {
          userId: response.payload.user.id,
          email: response.payload.user.email,
          emailVerified: response.payload.user.emailVerified,
        } as AuthSubject
      },
      async (error) => {
        const payload = match(error)
          .with({ type: 'unexpected_error' }, () => {
            reply.code(500)

            return { message: INTERNAL_SERVER_ERROR_MESSAGE }
          })
          .exhaustive()

        await reply.send(payload)
      },
    )
  }

export const registerAuthGuard = async (
  server: FastifyInstance,
  options: {
    iam: IamModule
  },
): Promise<void> => {
  const requireSession = requireUserSession(options.iam)

  server.decorateRequest('authSubject', null)

  server.addHook('preHandler', async (request, reply) => {
    if (request.routeOptions.config.auth === false) return

    await requireSession(request, reply)
  })
}

export const publicRouteConfig = { auth: false } satisfies FastifyContextConfig
