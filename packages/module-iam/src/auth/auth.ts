import type { Kysely } from 'kysely'
import { fromPromise, type Result, ok } from 'neverthrow'
import { toGetSessionError, toSignInError, toSignOutError, toSignUpError } from './errors'
import {
  parseSessionResult,
  parseSignInSuccessPayload,
  parseSignOutSuccessPayload,
  parseSignUpSuccessPayload,
} from './payloads'
import { createBetterAuth } from './better-auth'
import type {
  GetSessionResult,
  IamAuthSuccess,
  IamUnexpectedAuthError,
  SignInBody,
  SignInResult,
  SignOutResult,
  SignUpBody,
  SignUpResult,
} from '../public/contracts/auth'
import type { IamDatabase } from '../db/schema'

export type InternalIamAuth = {
  signUp: (body: SignUpBody, headers: Headers) => Promise<SignUpResult>
  signIn: (body: SignInBody, headers: Headers) => Promise<SignInResult>
  signOut: (headers: Headers) => Promise<SignOutResult>
  getSession: (headers: Headers) => Promise<GetSessionResult>
}

export type CreateInternalIamAuthDeps = {
  db: Kysely<IamDatabase>
  baseUrl: string
  authSecret: string
  trustedOrigins: string[]
}

const createAuthSuccess = <TPayload>(
  payload: TPayload,
  headers: Headers,
  status = 200,
): IamAuthSuccess<TPayload> => ({
  headers,
  payload,
  status,
})

const toAuthSuccess = <TPayload>(
  result: {
    headers: Headers
    response: unknown
  },
  parsePayload: (payload: unknown) => Result<TPayload, IamUnexpectedAuthError>,
  status = 200,
): Result<IamAuthSuccess<TPayload>, IamUnexpectedAuthError> =>
  parsePayload(result.response).map((payload) => createAuthSuccess(payload, result.headers, status))

export const createInternalIamAuth = (deps: CreateInternalIamAuthDeps): InternalIamAuth => {
  const auth = createBetterAuth({
    db: deps.db,
    authSecret: deps.authSecret,
    trustedOrigins: deps.trustedOrigins,
    baseUrl: deps.baseUrl,
  })

  return {
    signUp: async (body, headers) =>
      await fromPromise(
        auth.api.signUpEmail({
          body,
          headers,
          returnHeaders: true,
        }),
        toSignUpError,
      ).andThen((result) => toAuthSuccess(result, parseSignUpSuccessPayload, 201)),
    signIn: async (body, headers) =>
      await fromPromise(
        auth.api.signInEmail({
          body,
          headers,
          returnHeaders: true,
        }),
        toSignInError,
      ).andThen((result) => toAuthSuccess(result, parseSignInSuccessPayload)),
    signOut: async (headers) =>
      await fromPromise(
        auth.api.signOut({
          headers,
          returnHeaders: true,
        }),
        toSignOutError,
      ).andThen((result) => toAuthSuccess(result, parseSignOutSuccessPayload)),
    getSession: async (headers) =>
      await fromPromise(
        auth.api.getSession({
          headers,
          returnHeaders: true,
        }),
        toGetSessionError,
      ).andThen((result): GetSessionResult => {
        if (!result.response) {
          return ok(createAuthSuccess(null, result.headers))
        }

        return parseSessionResult(result.response).map((session) =>
          createAuthSuccess(session, result.headers),
        )
      }),
  }
}
