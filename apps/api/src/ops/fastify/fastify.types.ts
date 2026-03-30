import type { AuthSubject } from './auth-context'

declare module 'fastify' {
  interface FastifyContextConfig {
    auth?: boolean
    skipGlobalRateLimit?: boolean
  }

  interface FastifyRequest {
    authSubject: AuthSubject | null
  }
}
