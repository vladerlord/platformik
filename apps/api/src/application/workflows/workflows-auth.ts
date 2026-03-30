import type { IamModule } from '@platformik/module-iam/contracts'
import { err, ok, type Result } from 'neverthrow'
import { match } from 'ts-pattern'

export type WorkflowAuthError =
  | { type: 'missing_authorization' }
  | { type: 'invalid_session'; message: string }

export type WorkflowAuthContext = {
  userId: string
}

export const resolveWorkflowAuthMetadata = async (
  iam: IamModule,
  authHeader: string | undefined,
): Promise<Result<WorkflowAuthContext, WorkflowAuthError>> => {
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

  const userId = result.value.payload.user.id

  return ok({ userId })
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
