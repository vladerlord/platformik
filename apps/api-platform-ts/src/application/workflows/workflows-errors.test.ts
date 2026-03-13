import { describe, expect, test } from 'vitest'
import { ServerError } from 'nice-grpc'
import { mapWorkflowAuthError } from './workflows-auth'
import { mapWorkflowsGrpcError } from './workflows-errors'

describe('mapWorkflowAuthError', () => {
  test.each([
    {
      input: { type: 'missing_authorization' } as const,
      expected: {
        status: 401,
        code: 'UNAUTHENTICATED',
        message: 'Missing authorization header',
      },
    },
    {
      input: { type: 'invalid_session', message: 'No active session' } as const,
      expected: {
        status: 401,
        code: 'UNAUTHENTICATED',
        message: 'No active session',
      },
    },
  ])('maps $input.type', ({ input, expected }) => {
    expect(mapWorkflowAuthError(input)).toEqual(expected)
  })
})

describe('mapWorkflowsGrpcError', () => {
  test.each([
    { code: 3, status: 400 },
    { code: 5, status: 404 },
    { code: 7, status: 403 },
    { code: 16, status: 401 },
    { code: 13, status: 500 },
  ])('maps grpc code $code to http $status', ({ code, status }) => {
    expect(mapWorkflowsGrpcError(new ServerError(code, 'boom'))).toEqual({
      status,
      code: code.toString(),
      message: 'boom',
    })
  })

  test('maps non-grpc error to internal', () => {
    expect(mapWorkflowsGrpcError(new Error('unknown'))).toEqual({
      status: 500,
      code: 'INTERNAL',
      message: 'Error: unknown',
    })
  })
})
