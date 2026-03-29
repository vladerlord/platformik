import type { AuthContext } from '@platformik/contracts-auth-ts'
import type { IamModule, SessionUser } from '@platformik/module-iam-ts/contracts'
import { Metadata } from 'nice-grpc'
import { err, ok, type Result } from 'neverthrow'
import { match } from 'ts-pattern'

const AUTH_CONTEXT_METADATA_KEY = 'x-platformik-auth-context'

export type WorkflowAuthError =
  | { type: 'missing_authorization' }
  | { type: 'invalid_session'; message: string }

const buildAuthContext = (user: SessionUser): AuthContext => ({
  actor: { service: 'api-platform' },
  subject: {
    userId: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
  },
})

export const resolveWorkflowAuthMetadata = async (
  iam: IamModule,
  authHeader: string | undefined,
): Promise<Result<Metadata, WorkflowAuthError>> => {
  if (!authHeader) {
    return err({ type: 'missing_authorization' })
  }

  const signedToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader
  const result = await iam.auth.getSession(
    new Headers({ cookie: `better-auth.session_token=${signedToken}` }),
  )

  if (result.isErr()) {
    return err({ type: 'invalid_session', message: 'Session validation failed' })
  }

  if (!result.value.payload) {
    return err({ type: 'invalid_session', message: 'No active session' })
  }

  return ok(
    Metadata({
      [AUTH_CONTEXT_METADATA_KEY]: JSON.stringify(buildAuthContext(result.value.payload.user)),
    }),
  )
}

export const mapWorkflowAuthError = (
  error: WorkflowAuthError,
): { status: 401; code: 'UNAUTHENTICATED'; message: string } =>
  match(error)
    .with({ type: 'missing_authorization' }, () => ({
      status: 401 as const,
      code: 'UNAUTHENTICATED' as const,
      message: 'Missing authorization header',
    }))
    .with({ type: 'invalid_session' }, (sessionError) => ({
      status: 401 as const,
      code: 'UNAUTHENTICATED' as const,
      message: sessionError.message,
    }))
    .exhaustive()
