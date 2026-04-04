import type { FastifyReply } from 'fastify'

export type RequestHeaders = Record<string, string | string[] | undefined>

export const parseHeaders = (headers: RequestHeaders): Headers => {
  const result = new Headers()

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'undefined') continue

    if (Array.isArray(value)) {
      for (const item of value) {
        result.append(key, item)
      }
      continue
    }

    result.set(key, String(value))
  }

  return result
}

export const getSetCookieHeaders = (headers: Headers): string[] => {
  if ('getSetCookie' in headers && typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie()
  }

  const rawHeader = headers.get('set-cookie')

  return rawHeader ? [rawHeader] : []
}

export const applyHeadersToReply = (reply: FastifyReply, headers: Headers): void => {
  for (const cookie of getSetCookieHeaders(headers)) {
    reply.header('set-cookie', cookie)
  }

  for (const [key, value] of headers.entries()) {
    if (key.toLowerCase() === 'set-cookie') continue

    reply.header(key, value)
  }
}
