import { VALID_MATRIX_KEYS } from './constants.js'

export function normalizeMatrix(rawMatrix) {
  if (!rawMatrix || typeof rawMatrix !== 'object') {
    return { ok: false, reason: 'matrix must be an object' }
  }

  const normalized = {}

  for (const key of VALID_MATRIX_KEYS) {
    const entry = rawMatrix[key]
    if (!entry || typeof entry !== 'object') {
      return { ok: false, reason: `matrix is missing required key "${key}"` }
    }

    if (!Array.isArray(entry.allow)) {
      return { ok: false, reason: `matrix["${key}"].allow must be an array` }
    }

    for (const toKey of entry.allow) {
      if (!VALID_MATRIX_KEYS.has(toKey)) {
        return { ok: false, reason: `matrix["${key}"].allow contains unknown key "${toKey}"` }
      }
    }

    normalized[key] = {
      allow: new Set(entry.allow),
      denyReason: typeof entry.denyReason === 'string' ? entry.denyReason : null,
    }
  }

  for (const key of Object.keys(rawMatrix)) {
    if (!VALID_MATRIX_KEYS.has(key)) {
      return { ok: false, reason: `matrix contains unknown key "${key}"` }
    }
  }

  return { ok: true, matrix: normalized }
}
