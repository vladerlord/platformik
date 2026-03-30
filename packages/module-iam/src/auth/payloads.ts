import { err, ok, type Result } from 'neverthrow'
import { z } from 'zod'
import type {
  IamAuthUser,
  IamUnexpectedAuthError,
  SessionResult,
  SignInSuccessPayload,
  SignOutSuccessPayload,
  SignUpSuccessPayload,
} from '../contracts'
import {
  sessionResultSchema,
  signInSuccessPayloadSchema,
  signOutSuccessPayloadSchema,
  signUpSuccessPayloadSchema,
} from '../contracts'
import { toUnexpectedAuthError } from './errors'

const betterAuthUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  emailVerified: z.boolean(),
  name: z.string(),
  image: z.string().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

const betterAuthSignUpSuccessPayloadSchema = z.object({
  user: betterAuthUserSchema,
  token: z.string().nullable(),
})

const betterAuthSignInSuccessPayloadSchema = z.object({
  redirect: z.boolean(),
  url: z.string().optional(),
  user: betterAuthUserSchema,
  token: z.string(),
})

const betterAuthSignOutSuccessPayloadSchema = z.object({
  success: z.boolean(),
})

const betterAuthSessionSchema = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
    emailVerified: z.boolean(),
  }),
  session: z.object({
    id: z.string(),
    expiresAt: z.date(),
  }),
})

type BetterAuthUser = z.infer<typeof betterAuthUserSchema>

const parseWithUnexpectedError = <TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
): Result<z.infer<TSchema>, IamUnexpectedAuthError> => {
  const result = schema.safeParse(value)

  if (!result.success) {
    return err(toUnexpectedAuthError(result.error))
  }

  return ok(result.data)
}

const normalizeAuthUser = (user: BetterAuthUser): IamAuthUser => ({
  id: user.id,
  email: user.email,
  emailVerified: user.emailVerified,
  name: user.name,
  image: user.image,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
})

export const parseSignUpSuccessPayload = (
  payload: unknown,
): Result<SignUpSuccessPayload, IamUnexpectedAuthError> =>
  parseWithUnexpectedError(betterAuthSignUpSuccessPayloadSchema, payload).andThen((parsedPayload) =>
    parseWithUnexpectedError(signUpSuccessPayloadSchema, {
      user: normalizeAuthUser(parsedPayload.user),
    }),
  )

export const parseSignInSuccessPayload = (
  payload: unknown,
): Result<SignInSuccessPayload, IamUnexpectedAuthError> =>
  parseWithUnexpectedError(betterAuthSignInSuccessPayloadSchema, payload).andThen((parsedPayload) =>
    parseWithUnexpectedError(signInSuccessPayloadSchema, {
      redirect: parsedPayload.redirect,
      url: parsedPayload.url,
      user: normalizeAuthUser(parsedPayload.user),
    }),
  )

export const parseSignOutSuccessPayload = (
  payload: unknown,
): Result<SignOutSuccessPayload, IamUnexpectedAuthError> =>
  parseWithUnexpectedError(betterAuthSignOutSuccessPayloadSchema, payload).andThen((parsedPayload) =>
    parseWithUnexpectedError(signOutSuccessPayloadSchema, parsedPayload),
  )

export const parseSessionResult = (payload: unknown): Result<SessionResult, IamUnexpectedAuthError> =>
  parseWithUnexpectedError(betterAuthSessionSchema, payload).andThen((parsedPayload) =>
    parseWithUnexpectedError(sessionResultSchema, {
      user: {
        id: parsedPayload.user.id,
        name: parsedPayload.user.name,
        email: parsedPayload.user.email,
        emailVerified: parsedPayload.user.emailVerified,
      },
      session: {
        id: parsedPayload.session.id,
        expiresAt: parsedPayload.session.expiresAt,
      },
    }),
  )
