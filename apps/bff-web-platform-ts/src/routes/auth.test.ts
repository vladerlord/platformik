import { afterEach, describe, expect, test } from 'vitest'
import rateLimit from '@fastify/rate-limit'
import type {
  GetSessionError,
  IamAuthUser,
  IamModule,
  SessionResult,
  SignInError,
  SignInSuccessPayload,
  SignOutError,
  SignOutSuccessPayload,
  SignUpError,
  SignUpSuccessPayload,
} from '@platformik/module-iam-ts/contracts'
import { createPinoLogger } from '@platformik/runtime-pino-ts'
import { createFastifyServer } from '@platformik/runtime-fastify-ts'
import type { FastifyInstance } from '@platformik/runtime-fastify-ts'
import { err, ok } from 'neverthrow'
import { registerAiProvidersRoutes } from './ai-providers'
import { resolveAppRateLimitConfig } from '../config/rate-limit'
import { authWriteRoutePaths, registerAuthRoutes } from './auth'
import { registerAuthGuard } from '../ops/http/auth'

const parseJsonBody = (body: string): unknown => JSON.parse(body)
const normalizeSetCookieHeader = (header: string | string[] | undefined): string[] => {
  if (!header) return []

  return Array.isArray(header) ? header : [header]
}

const createAuthUser = (): IamAuthUser => ({
  id: 'user-1',
  email: 'test@example.com',
  emailVerified: true,
  name: 'Test User',
  image: null,
  createdAt: new Date('2030-01-01T00:00:00.000Z'),
  updatedAt: new Date('2030-01-01T00:00:00.000Z'),
})

const createSession = (): SessionResult => ({
  user: {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    emailVerified: true,
  },
  session: {
    id: 'session-1',
    expiresAt: new Date('2030-01-01T00:00:00.000Z'),
  },
})

const createSignUpSuccessPayload = (): SignUpSuccessPayload => ({
  user: createAuthUser(),
})

const createSignInSuccessPayload = (): SignInSuccessPayload => ({
  redirect: false,
  user: createAuthUser(),
})

const createSignOutSuccessPayload = (): SignOutSuccessPayload => ({
  success: true,
})

const createAuthSuccess = <TPayload>(payload: TPayload, status = 200, headers = new Headers()) => ({
  headers,
  payload,
  status,
})

const createMockIam = ({
  session = null,
  getSessionHeaders = new Headers(),
  getSessionError,
  signInError,
  signOutError,
  signUpError,
}: {
  session?: SessionResult | null
  getSessionHeaders?: Headers
  getSessionError?: GetSessionError
  signInError?: SignInError
  signOutError?: SignOutError
  signUpError?: SignUpError
} = {}): IamModule => ({
  auth: {
    signUp: async () =>
      signUpError ? err(signUpError) : ok(createAuthSuccess(createSignUpSuccessPayload(), 201)),
    signIn: async () => {
      if (signInError) return err(signInError)

      const headers = new Headers()
      headers.append('set-cookie', 'better-auth.session_token=opaque; HttpOnly; Path=/')

      return ok(createAuthSuccess(createSignInSuccessPayload(), 200, headers))
    },
    signOut: async () =>
      signOutError ? err(signOutError) : ok(createAuthSuccess(createSignOutSuccessPayload())),
    getSession: async () =>
      getSessionError ? err(getSessionError) : ok(createAuthSuccess(session, 200, getSessionHeaders)),
  },
})

const activeServers = new Set<FastifyInstance>()

afterEach(async () => {
  for (const server of activeServers) {
    await server.close()
    activeServers.delete(server)
  }
})

const buildTestServer = async ({
  iam = createMockIam(),
  rateLimitConfig = resolveAppRateLimitConfig('test'),
  registerGlobalRateLimit = false,
}: {
  iam?: IamModule
  rateLimitConfig?: ReturnType<typeof resolveAppRateLimitConfig>
  registerGlobalRateLimit?: boolean
} = {}): Promise<FastifyInstance> => {
  const server = createFastifyServer({
    logger: createPinoLogger({ level: 'fatal', name: 'bff-web-platform-test' }),
  })

  await server.register(rateLimit, { global: false })

  if (registerGlobalRateLimit) {
    const globalRateLimitPreHandler = server.rateLimit(rateLimitConfig.global)

    server.addHook('preHandler', async (request, reply) => {
      const routeUrl = request.routeOptions.url ?? ''

      if (authWriteRoutePaths.has(routeUrl)) return

      await globalRateLimitPreHandler.call(server, request, reply)
    })
  }

  await registerAuthGuard(server, { iam })
  await registerAuthRoutes(server, {
    iam,
    authWriteRateLimit: rateLimitConfig.authWrite,
    trustedOrigins: ['http://localhost:5173'],
  })
  await registerAiProvidersRoutes(server)

  activeServers.add(server)

  return server
}
describe('registerAuthRoutes', () => {
  test('rejects invalid sign-in payloads', async () => {
    const server = await buildTestServer()
    const response = await server.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: {
        email: 'bad-email',
        password: 'short',
      },
    })

    expect(response.statusCode).toBe(400)
    expect(parseJsonBody(response.body)).toEqual({ message: 'Invalid request' })
  })

  test('maps invalid credentials to generic auth failure', async () => {
    const server = await buildTestServer({
      iam: createMockIam({
        signInError: { type: 'invalid_credentials' },
      }),
    })
    const response = await server.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: {
        email: 'test@example.com',
        password: 'long-enough-password',
      },
    })

    expect(response.statusCode).toBe(401)
    expect(parseJsonBody(response.body)).toEqual({ message: 'Authentication failed' })
  })

  test('enforces trusted origins on sign-out', async () => {
    const server = await buildTestServer()
    const response = await server.inject({
      method: 'POST',
      url: '/auth/sign-out',
    })

    expect(response.statusCode).toBe(403)
    expect(parseJsonBody(response.body)).toEqual({ message: 'Forbidden' })
  })

  test('forwards IAM sign-in cookies', async () => {
    const server = await buildTestServer()
    const response = await server.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: {
        email: 'test@example.com',
        password: 'long-enough-password',
      },
    })

    expect(response.statusCode).toBe(200)
    expect(parseJsonBody(response.body)).toEqual({
      redirect: false,
      user: {
        id: 'user-1',
        email: 'test@example.com',
        emailVerified: true,
        name: 'Test User',
        image: null,
        createdAt: '2030-01-01T00:00:00.000Z',
        updatedAt: '2030-01-01T00:00:00.000Z',
      },
    })
    expect(normalizeSetCookieHeader(response.headers['set-cookie'])).toEqual(
      expect.arrayContaining(['better-auth.session_token=opaque; HttpOnly; Path=/']),
    )
  })

  test('forwards IAM session cookies on session route', async () => {
    const headers = new Headers()
    headers.append('set-cookie', 'better-auth.session_data=opaque; HttpOnly; Path=/')

    const server = await buildTestServer({
      iam: createMockIam({
        session: createSession(),
        getSessionHeaders: headers,
      }),
    })
    const response = await server.inject({
      method: 'GET',
      url: '/auth/session',
    })

    expect(response.statusCode).toBe(200)
    expect(normalizeSetCookieHeader(response.headers['set-cookie'])).toEqual(
      expect.arrayContaining(['better-auth.session_data=opaque; HttpOnly; Path=/']),
    )
  })

  test('forwards IAM session cookies on protected routes', async () => {
    const headers = new Headers()
    headers.append('set-cookie', 'better-auth.session_data=opaque; HttpOnly; Path=/')

    const server = await buildTestServer({
      iam: createMockIam({
        session: createSession(),
        getSessionHeaders: headers,
      }),
    })
    const response = await server.inject({
      method: 'GET',
      url: '/ai-providers',
    })

    expect(response.statusCode).toBe(200)
    expect(normalizeSetCookieHeader(response.headers['set-cookie'])).toEqual(
      expect.arrayContaining(['better-auth.session_data=opaque; HttpOnly; Path=/']),
    )
  })

  test('applies a stricter limit to auth write routes than the global limit', async () => {
    const server = await buildTestServer({
      registerGlobalRateLimit: true,
      rateLimitConfig: resolveAppRateLimitConfig('test', {
        authWrite: {
          max: 1,
        },
        global: {
          max: 3,
        },
      }),
      iam: createMockIam({
        session: createSession(),
      }),
    })

    const firstSignInResponse = await server.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: {
        email: 'test@example.com',
        password: 'long-enough-password',
      },
    })
    const secondSignInResponse = await server.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: {
        email: 'test@example.com',
        password: 'long-enough-password',
      },
    })
    const firstProtectedResponse = await server.inject({
      method: 'GET',
      url: '/ai-providers',
    })
    const secondProtectedResponse = await server.inject({
      method: 'GET',
      url: '/ai-providers',
    })

    expect(firstSignInResponse.statusCode).toBe(200)
    expect(secondSignInResponse.statusCode).toBe(429)
    expect(firstProtectedResponse.statusCode).toBe(200)
    expect(secondProtectedResponse.statusCode).toBe(200)
  })

  test('shares auth write limits across auth mutation routes', async () => {
    const server = await buildTestServer({
      rateLimitConfig: resolveAppRateLimitConfig('test', {
        authWrite: {
          max: 1,
        },
      }),
    })

    const firstSignInResponse = await server.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: {
        email: 'test@example.com',
        password: 'long-enough-password',
      },
    })
    const secondSignUpResponse = await server.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: {
        email: 'test@example.com',
        password: 'long-enough-password',
      },
    })

    expect(firstSignInResponse.statusCode).toBe(200)
    expect(secondSignUpResponse.statusCode).toBe(429)
  })

  test('rejects unauthenticated access to protected routes', async () => {
    const server = await buildTestServer()
    const response = await server.inject({
      method: 'GET',
      url: '/ai-providers',
    })

    expect(response.statusCode).toBe(401)
    expect(parseJsonBody(response.body)).toEqual({ message: 'Unauthorized' })
  })

  test('fails protected routes when session lookup errors', async () => {
    const server = await buildTestServer({
      iam: createMockIam({
        getSessionError: { type: 'unexpected_error', cause: new Error('boom') },
      }),
    })
    const response = await server.inject({
      method: 'GET',
      url: '/ai-providers',
    })

    expect(response.statusCode).toBe(500)
    expect(parseJsonBody(response.body)).toEqual({ message: 'Internal server error' })
  })

  test('allows authenticated access to protected routes', async () => {
    const server = await buildTestServer({
      iam: createMockIam({
        session: createSession(),
      }),
    })
    const response = await server.inject({
      method: 'GET',
      url: '/ai-providers',
    })

    expect(response.statusCode).toBe(200)
    expect(parseJsonBody(response.body)).toEqual({})
  })
})
