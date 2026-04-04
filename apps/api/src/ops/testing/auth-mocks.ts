import type {
  IamAuthUser,
  IamModule,
  SessionResult,
  SignInSuccessPayload,
  SignOutSuccessPayload,
  SignUpSuccessPayload,
} from '@platformik/module-iam/contracts'
import type { Result } from 'neverthrow'
import { ok } from 'neverthrow'
import { vi } from 'vitest'

const createAuthUser = (): IamAuthUser => ({
  id: 'user-1',
  email: 'test@example.com',
  emailVerified: true,
  name: 'Test User',
  image: null,
  createdAt: new Date('2030-01-01T00:00:00.000Z'),
  updatedAt: new Date('2030-01-01T00:00:00.000Z'),
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

type AuthSuccess<TPayload> = {
  headers: Headers
  payload: TPayload
  status: number
}

type AuthSuccessResult<TPayload> = Result<AuthSuccess<TPayload>, never>

const createAuthSuccess = <TPayload>(
  payload: TPayload,
  status = 200,
  headers = new Headers(),
): AuthSuccess<TPayload> => ({
  headers,
  payload,
  status,
})

export const createSignInSuccess = (headers?: Headers): AuthSuccessResult<SignInSuccessPayload> => {
  const responseHeaders = headers ?? new Headers()
  if (headers === undefined) {
    responseHeaders.append('set-cookie', 'better-auth.session_token=opaque; HttpOnly; Path=/')
  }

  return ok(createAuthSuccess(createSignInSuccessPayload(), 200, responseHeaders))
}

export type AuthIamMocks = {
  iam: IamModule
  signUp: ReturnType<typeof vi.fn>
  signIn: ReturnType<typeof vi.fn>
  signOut: ReturnType<typeof vi.fn>
  getSession: ReturnType<typeof vi.fn>
}

export const createAuthIamMocks = (): AuthIamMocks => {
  const signUp = vi.fn().mockResolvedValue(ok(createAuthSuccess(createSignUpSuccessPayload(), 201)))
  const signIn = vi.fn().mockResolvedValue(createSignInSuccess())
  const signOut = vi.fn().mockResolvedValue(ok(createAuthSuccess(createSignOutSuccessPayload(), 200)))
  const getSession = vi.fn().mockResolvedValue(ok(createAuthSuccess<SessionResult | null>(null, 200)))

  return {
    iam: {
      auth: {
        signUp,
        signIn,
        signOut,
        getSession,
      },
    },
    signUp,
    signIn,
    signOut,
    getSession,
  }
}

export const resetAuthIamMocks = (mocks: AuthIamMocks): void => {
  mocks.signUp.mockReset().mockResolvedValue(ok(createAuthSuccess(createSignUpSuccessPayload(), 201)))
  mocks.signIn.mockReset().mockResolvedValue(createSignInSuccess())
  mocks.signOut.mockReset().mockResolvedValue(ok(createAuthSuccess(createSignOutSuccessPayload(), 200)))
  mocks.getSession.mockReset().mockResolvedValue(ok(createAuthSuccess<SessionResult | null>(null, 200)))
}

export const createSessionSuccess = (
  session: SessionResult | null,
  headers: Headers = new Headers(),
): AuthSuccessResult<SessionResult | null> =>
  ok(createAuthSuccess(session, 200, headers))
