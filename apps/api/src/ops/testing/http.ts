export const parseJsonBody = (body: string): unknown => JSON.parse(body)

export const normalizeSetCookieHeader = (header: string | string[] | undefined): string[] => {
  if (!header) return []

  return Array.isArray(header) ? header : [header]
}
