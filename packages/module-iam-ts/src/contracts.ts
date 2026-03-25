import type { Kysely } from 'kysely'
import type { Result } from 'neverthrow'
import { z } from 'zod'
import type { IamDatabase } from './db/schema'

export type { IamDatabase } from './db/schema'

export const signUpBodySchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(12).max(128),
})
export type SignUpBody = z.infer<typeof signUpBodySchema>

export const signInBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})
export type SignInBody = z.infer<typeof signInBodySchema>

export const iamAuthUserSchema = z
  .object({
    id: z.string(),
    email: z.string().email(),
    emailVerified: z.boolean(),
    name: z.string(),
    image: z.string().nullable().optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict()
export type IamAuthUser = z.infer<typeof iamAuthUserSchema>

export const signUpSuccessPayloadSchema = z
  .object({
    user: iamAuthUserSchema,
  })
  .strict()
export type SignUpSuccessPayload = z.infer<typeof signUpSuccessPayloadSchema>

export const signInSuccessPayloadSchema = z
  .object({
    redirect: z.boolean(),
    url: z.string().optional(),
    user: iamAuthUserSchema,
  })
  .strict()
export type SignInSuccessPayload = z.infer<typeof signInSuccessPayloadSchema>

export const signOutSuccessPayloadSchema = z
  .object({
    success: z.boolean(),
  })
  .strict()
export type SignOutSuccessPayload = z.infer<typeof signOutSuccessPayloadSchema>

export const sessionUserSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
    emailVerified: z.boolean(),
  })
  .strict()
export type SessionUser = z.infer<typeof sessionUserSchema>

export const sessionResultSchema = z
  .object({
    user: sessionUserSchema,
    session: z
      .object({
        id: z.string(),
        expiresAt: z.date(),
      })
      .strict(),
  })
  .strict()
export type SessionResult = z.infer<typeof sessionResultSchema>

export type IamAuthSuccess<TPayload> = {
  headers: Headers
  payload: TPayload
  status: number
}

export type IamUnexpectedAuthError = {
  type: 'unexpected_error'
  cause: unknown
}

export type SignUpError =
  | { type: 'invalid_email' }
  | { type: 'invalid_password' }
  | { type: 'password_too_short' }
  | { type: 'password_too_long' }
  | { type: 'user_already_exists' }
  | { type: 'failed_to_create_user' }
  | { type: 'failed_to_create_session' }
  | IamUnexpectedAuthError

export type SignInError =
  | { type: 'invalid_email' }
  | { type: 'invalid_credentials' }
  | { type: 'email_not_verified' }
  | { type: 'failed_to_create_session' }
  | IamUnexpectedAuthError

export type SignOutError = IamUnexpectedAuthError

export type GetSessionError = IamUnexpectedAuthError

export type SignUpResult = Result<IamAuthSuccess<SignUpSuccessPayload>, SignUpError>
export type SignInResult = Result<IamAuthSuccess<SignInSuccessPayload>, SignInError>
export type SignOutResult = Result<IamAuthSuccess<SignOutSuccessPayload>, SignOutError>
export type GetSessionSuccess = IamAuthSuccess<SessionResult | null>
export type GetSessionResult = Result<GetSessionSuccess, GetSessionError>

export type IamMigrations<TDb> = Record<
  string,
  {
    up: (db: Kysely<TDb>) => Promise<void>
    down: (db: Kysely<TDb>) => Promise<void>
  }
>

export type IamModule = {
  auth: {
    signUp: (body: SignUpBody, headers: Headers) => Promise<SignUpResult>
    signIn: (body: SignInBody, headers: Headers) => Promise<SignInResult>
    signOut: (headers: Headers) => Promise<SignOutResult>
    getSession: (headers: Headers) => Promise<GetSessionResult>
  }
}

export type IamModuleDeps = {
  db: Kysely<IamDatabase>
  baseUrl: string
  authSecret: string
  trustedOrigins: string[]
}
