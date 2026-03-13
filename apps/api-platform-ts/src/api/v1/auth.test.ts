import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { AppRateLimitConfigOverride } from '../../config/rate-limit'
import { createPinoLogger } from '@platformik/runtime-pino-ts'
import type { Container } from '../../container'
import { err } from 'neverthrow'
import { createTestSession } from '../../ops/testing/iam'
import { normalizeSetCookieHeader, parseJsonBody } from '../../ops/testing/http'
import { buildIntegrationTestContainer } from '../../ops/testing/container'
import {
  createAuthIamMocks,
  createSessionSuccess,
  createSignInSuccess,
  resetAuthIamMocks,
} from '../../ops/testing/auth-mocks'
import {
  createMockEventBusListener,
  createMockWorkflowRunNotifier,
  createWorkflowsClientMocks,
  resetWorkflowsClientMocks,
} from '../../ops/testing/workflows-mocks'

const activeContainers = new Set<Container>()
const iam = createAuthIamMocks()
const workflowsClient = createWorkflowsClientMocks()
const eventBusListener = createMockEventBusListener()
const workflowRunNotifier = createMockWorkflowRunNotifier()

beforeEach(() => {
  resetAuthIamMocks(iam)
  resetWorkflowsClientMocks(workflowsClient)
})

afterEach(async () => {
  for (const container of activeContainers) {
    await container.server.close()
    activeContainers.delete(container)
  }
})

const buildTestServer = async (options: { rateLimitConfigOverride?: AppRateLimitConfigOverride } = {}) => {
  const deps = {
    logger: createPinoLogger({ level: 'fatal', name: 'api-platform-auth-test' }),
    iam: iam.iam,
    workflowsClient: workflowsClient.client,
    eventBusListener,
    workflowRunNotifier,
    ...(options.rateLimitConfigOverride ? { rateLimitConfigOverride: options.rateLimitConfigOverride } : {}),
  }

  const result = await buildIntegrationTestContainer({
    deps,
  })
  activeContainers.add(result.container)

  return result.container.server
}

describe('registerAuthRoutes', () => {
  test('rejects invalid sign-in payloads', async () => {
    const server = await buildTestServer()
    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/sign-in',
      payload: {
        email: 'bad-email',
        password: 'short',
      },
    })

    expect(response.statusCode).toBe(400)
    expect(parseJsonBody(response.body)).toEqual({ message: 'Invalid request' })
  })

  test('maps invalid credentials to generic auth failure', async () => {
    iam.signIn.mockResolvedValueOnce(err({ type: 'invalid_credentials' }))

    const server = await buildTestServer()
    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/sign-in',
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
      url: '/api/v1/auth/sign-out',
    })

    expect(response.statusCode).toBe(403)
    expect(parseJsonBody(response.body)).toEqual({ message: 'Forbidden' })
  })

  test('forwards IAM sign-in cookies', async () => {
    const server = await buildTestServer()
    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/sign-in',
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

  test('extracts session token when it is in the second set-cookie header', async () => {
    const signInHeaders = new Headers()
    signInHeaders.append('set-cookie', 'better-auth.session_data=opaque; HttpOnly; Path=/')
    signInHeaders.append('set-cookie', 'better-auth.session_token=token-2; HttpOnly; Path=/')
    iam.signIn.mockResolvedValueOnce(createSignInSuccess(signInHeaders))

    const server = await buildTestServer()
    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'test@example.com',
        password: 'long-enough-password',
      },
    })

    expect(response.statusCode).toBe(200)
    expect(parseJsonBody(response.body)).toEqual({ sessionToken: 'token-2' })
  })

  test('forwards IAM session cookies on session route', async () => {
    const headers = new Headers()
    headers.append('set-cookie', 'better-auth.session_data=opaque; HttpOnly; Path=/')
    iam.getSession.mockResolvedValueOnce(createSessionSuccess(createTestSession(), headers))

    const server = await buildTestServer()
    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
    })

    expect(response.statusCode).toBe(200)
    expect(normalizeSetCookieHeader(response.headers['set-cookie'])).toEqual(
      expect.arrayContaining(['better-auth.session_data=opaque; HttpOnly; Path=/']),
    )
  })

  test('forwards IAM session cookies on protected routes', async () => {
    const headers = new Headers()
    headers.append('set-cookie', 'better-auth.session_data=opaque; HttpOnly; Path=/')
    iam.getSession.mockResolvedValueOnce(createSessionSuccess(createTestSession(), headers))

    const server = await buildTestServer()
    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/ai-providers',
    })

    expect(response.statusCode).toBe(200)
    expect(normalizeSetCookieHeader(response.headers['set-cookie'])).toEqual(
      expect.arrayContaining(['better-auth.session_data=opaque; HttpOnly; Path=/']),
    )
  })

  test('applies a stricter limit to auth write routes than the global limit', async () => {
    iam.getSession.mockResolvedValue(createSessionSuccess(createTestSession()))

    const server = await buildTestServer({
      rateLimitConfigOverride: {
        authWrite: {
          max: 1,
        },
        global: {
          max: 3,
        },
      },
    })

    const firstSignInResponse = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/sign-in',
      payload: {
        email: 'test@example.com',
        password: 'long-enough-password',
      },
    })
    const secondSignInResponse = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/sign-in',
      payload: {
        email: 'test@example.com',
        password: 'long-enough-password',
      },
    })
    const firstProtectedResponse = await server.inject({
      method: 'GET',
      url: '/api/v1/ai-providers',
    })
    const secondProtectedResponse = await server.inject({
      method: 'GET',
      url: '/api/v1/ai-providers',
    })

    expect(firstSignInResponse.statusCode).toBe(200)
    expect(secondSignInResponse.statusCode).toBe(429)
    expect(firstProtectedResponse.statusCode).toBe(200)
    expect(secondProtectedResponse.statusCode).toBe(200)
  })

  test('shares auth write limits across auth mutation routes', async () => {
    const server = await buildTestServer({
      rateLimitConfigOverride: {
        authWrite: {
          max: 1,
        },
      },
    })

    const firstSignInResponse = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/sign-in',
      payload: {
        email: 'test@example.com',
        password: 'long-enough-password',
      },
    })
    const secondSignUpResponse = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/sign-up',
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
      url: '/api/v1/ai-providers',
    })

    expect(response.statusCode).toBe(401)
    expect(parseJsonBody(response.body)).toEqual({ message: 'Unauthorized' })
  })

  test('fails protected routes when session lookup errors', async () => {
    iam.getSession.mockResolvedValueOnce(err({ type: 'unexpected_error', cause: new Error('boom') }))

    const server = await buildTestServer()
    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/ai-providers',
    })

    expect(response.statusCode).toBe(500)
    expect(parseJsonBody(response.body)).toEqual({ message: 'Internal server error' })
  })

  test('allows authenticated access to protected routes', async () => {
    iam.getSession.mockResolvedValueOnce(createSessionSuccess(createTestSession()))

    const server = await buildTestServer()
    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/ai-providers',
    })

    expect(response.statusCode).toBe(200)
    expect(parseJsonBody(response.body)).toEqual({ providers: [] })
  })
})
