import { ServerError } from 'nice-grpc'

const grpcCodeToHttpStatus: Record<number, 400 | 401 | 403 | 404> = {
  3: 400,
  5: 404,
  7: 403,
  16: 401,
}

export const mapWorkflowsGrpcError = (
  error: unknown,
): { status: 400 | 401 | 403 | 404 | 500; code: string; message: string } => {
  if (error instanceof ServerError) {
    return {
      status: grpcCodeToHttpStatus[error.code] ?? 500,
      code: error.code.toString(),
      message: error.details,
    }
  }

  return { status: 500, code: 'INTERNAL', message: String(error) }
}
