import { z } from 'zod'
import type {
  GetSessionError,
  IamUnexpectedAuthError,
  SignInError,
  SignOutError,
  SignUpError,
} from '../public/contracts/auth'

const betterAuthErrorSchema = z.object({
  body: z.object({
    code: z.string(),
  }),
})

export const toUnexpectedAuthError = (cause: unknown): IamUnexpectedAuthError => ({
  type: 'unexpected_error',
  cause,
})

const getAuthErrorCode = (error: unknown): string | null => {
  const result = betterAuthErrorSchema.safeParse(error)

  return result.success ? result.data.body.code : null
}

export const toSignUpError = (error: unknown): SignUpError => {
  switch (getAuthErrorCode(error)) {
    case 'INVALID_EMAIL':
      return { type: 'invalid_email' }
    case 'INVALID_PASSWORD':
      return { type: 'invalid_password' }
    case 'PASSWORD_TOO_SHORT':
      return { type: 'password_too_short' }
    case 'PASSWORD_TOO_LONG':
      return { type: 'password_too_long' }
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return { type: 'user_already_exists' }
    case 'FAILED_TO_CREATE_USER':
      return { type: 'failed_to_create_user' }
    case 'FAILED_TO_CREATE_SESSION':
      return { type: 'failed_to_create_session' }
    default:
      return toUnexpectedAuthError(error)
  }
}

export const toSignInError = (error: unknown): SignInError => {
  switch (getAuthErrorCode(error)) {
    case 'INVALID_EMAIL':
      return { type: 'invalid_email' }
    case 'INVALID_EMAIL_OR_PASSWORD':
      return { type: 'invalid_credentials' }
    case 'EMAIL_NOT_VERIFIED':
      return { type: 'email_not_verified' }
    case 'FAILED_TO_CREATE_SESSION':
      return { type: 'failed_to_create_session' }
    default:
      return toUnexpectedAuthError(error)
  }
}

export const toSignOutError = (error: unknown): SignOutError => toUnexpectedAuthError(error)

export const toGetSessionError = (error: unknown): GetSessionError => toUnexpectedAuthError(error)
