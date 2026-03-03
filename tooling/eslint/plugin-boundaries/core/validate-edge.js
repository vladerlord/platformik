import { getProjectLanguage, projectToBoundaryKey } from './classify.js'

export function validateEdge({ from, to, matrix }) {
  if (from.kind === 'app' && to.kind === 'app') {
    return { ok: false, reason: 'apps must not depend on other apps' }
  }

  if (from.kind === 'package' && to.kind === 'app') {
    return { ok: false, reason: 'packages must not depend on apps' }
  }

  if (from.kind === 'package' && to.kind === 'package' && from.dir === to.dir) {
    return { ok: true }
  }

  const fromKey = projectToBoundaryKey(from)
  const toKey = projectToBoundaryKey(to)

  if (!fromKey) {
    return { ok: false, reason: 'source project name is not classifiable by boundaries naming rules' }
  }

  if (!toKey) {
    return { ok: false, reason: 'target project name is not classifiable by boundaries naming rules' }
  }

  const fromLang = getProjectLanguage(from)
  const toLang = getProjectLanguage(to)
  if (fromLang && toLang && fromLang !== toLang) {
    return { ok: false, reason: 'cross-language source imports are forbidden' }
  }

  const fromRule = matrix[fromKey]
  if (!fromRule) {
    return { ok: false, reason: 'no boundary rule exists for this project kind' }
  }

  if (!fromRule.allow.has(toKey)) {
    return {
      ok: false,
      reason: fromRule.denyReason || 'dependency is not allowed by the boundary rules',
    }
  }

  return { ok: true }
}
