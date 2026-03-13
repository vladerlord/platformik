import type { PolicyRule } from './config.ts'

export interface Violation {
  dependency: string
  reason: string
}

const DEPENDENCY_FLOW: Record<string, string[]> = {
  app: ['lib', 'module', 'contracts', 'runtime', 'vendor'],
  module: ['lib', 'contracts', 'runtime', 'vendor'],
  contracts: ['lib'],
  lib: ['lib'],
  runtime: ['lib'],
  vendor: ['lib'],
}

function getRoleFromInternalDep(depName: string, monorepoScope: string): string | null {
  const prefix = monorepoScope + '/'
  if (!depName.startsWith(prefix)) return null
  const pkgDirName = depName.slice(prefix.length)
  const tokens = pkgDirName.split('-')
  if (tokens.length < 3) return null

  return tokens[0] ?? null
}

export function validate(
  deps: string[],
  rule: PolicyRule,
  lang: string,
  monorepoScope: string,
  role: string,
): Violation[] {
  const violations: Violation[] = []

  const external = deps.filter((dep) => !dep.startsWith(monorepoScope + '/'))
  const internal = deps.filter((dep) => dep.startsWith(monorepoScope + '/'))

  // External dependency policy check
  if (rule.mode === 'deny_all') {
    for (const dep of external) {
      violations.push({
        dependency: dep,
        reason: `no external dependencies allowed (mode: deny_all)`,
      })
    }
  } else if (rule.mode === 'allow') {
    const allowed = rule.packages[lang] ?? []
    for (const dep of external) {
      if (!allowed.includes(dep)) {
        violations.push({
          dependency: dep,
          reason:
            allowed.length > 0
              ? `not in the allowlist for language "${lang}" (allowed: ${allowed.join(', ')})`
              : `no external dependencies allowed for language "${lang}" (empty allowlist)`,
        })
      }
    }
  } else if (rule.mode === 'deny') {
    const blocked = rule.packages[lang] ?? []
    for (const dep of external) {
      if (blocked.includes(dep)) {
        violations.push({ dependency: dep, reason: `explicitly forbidden for language "${lang}"` })
      }
    }
  }
  // allow_any: no external dep violations

  // Internal dependency flow check
  const allowedRoles = DEPENDENCY_FLOW[role]
  if (allowedRoles) {
    for (const dep of internal) {
      const depRole = getRoleFromInternalDep(dep, monorepoScope)
      if (depRole && !allowedRoles.includes(depRole)) {
        violations.push({
          dependency: dep,
          reason: `"${role}" cannot depend on "${depRole}"`,
        })
      }
    }
  }

  return violations
}
