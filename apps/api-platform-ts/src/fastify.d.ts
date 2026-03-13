import type { UserSubject } from '@platformik/contracts-auth-ts'

declare module 'fastify' {
  interface FastifyContextConfig {
    auth?: boolean
    skipGlobalRateLimit?: boolean
  }

  interface FastifyRequest {
    authSubject: UserSubject | null
  }
}
