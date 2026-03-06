import type { RequestHeaders } from './headers'

const getRequestOrigin = (request: { headers: RequestHeaders }): string | null => {
  const origin = request.headers.origin
  if (typeof origin === 'string') return origin

  const referer = request.headers.referer
  if (typeof referer !== 'string') return null

  try {
    return new URL(referer).origin
  } catch {
    return null
  }
}

export const hasTrustedOrigin = (request: { headers: RequestHeaders }, trustedOrigins: string[]): boolean => {
  const origin = getRequestOrigin(request)

  return !!origin && trustedOrigins.includes(origin)
}
