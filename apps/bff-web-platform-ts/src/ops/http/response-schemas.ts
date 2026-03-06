import z from 'zod'

export const INVALID_REQUEST_MESSAGE = 'Invalid request'
export const FORBIDDEN_MESSAGE = 'Forbidden'
export const UNAUTHORIZED_MESSAGE = 'Unauthorized'
export const AUTHENTICATION_FAILED_MESSAGE = 'Authentication failed'
export const SIGN_UP_FAILED_MESSAGE = 'Unable to create account'
export const INTERNAL_SERVER_ERROR_MESSAGE = 'Internal server error'

export const invalidRequestResponseSchema = z.object({
  message: z.literal(INVALID_REQUEST_MESSAGE),
})
export const forbiddenResponseSchema = z.object({
  message: z.literal(FORBIDDEN_MESSAGE),
})
export const unauthorizedResponseSchema = z.object({
  message: z.literal(UNAUTHORIZED_MESSAGE),
})
export const authenticationFailedResponseSchema = z.object({
  message: z.literal(AUTHENTICATION_FAILED_MESSAGE),
})
export const signUpFailedResponseSchema = z.object({
  message: z.literal(SIGN_UP_FAILED_MESSAGE),
})
export const internalServerErrorResponseSchema = z.object({
  message: z.literal(INTERNAL_SERVER_ERROR_MESSAGE),
})
