import { readFileSync } from 'fs'
import { parse } from 'yaml'

export type RuleMode = 'deny_all' | 'allow' | 'deny' | 'allow_any'

export type PolicyRule =
  | { mode: 'deny_all' }
  | { mode: 'allow_any' }
  | { mode: 'allow'; packages: Record<string, string[]> }
  | { mode: 'deny'; packages: Record<string, string[]> }

export interface PolicyConfig {
  monorepoScope: string
  rules: Record<string, PolicyRule>
}

const VALID_MODES: RuleMode[] = ['deny_all', 'allow', 'deny', 'allow_any']

const REQUIRED_ROLES = ['lib', 'module', 'contracts', 'runtime', 'vendor', 'app']

export function loadConfig(configPath: string): PolicyConfig {
  const raw = readFileSync(configPath, 'utf8')
  const parsed = parse(raw) as Record<string, unknown>

  if (typeof parsed['monorepoScope'] !== 'string') {
    throw new Error('policy.yaml: missing or invalid "monorepoScope"')
  }

  if (!parsed['rules'] || typeof parsed['rules'] !== 'object' || Array.isArray(parsed['rules'])) {
    throw new Error('policy.yaml: missing or invalid "rules"')
  }

  const rules = parsed['rules'] as Record<string, unknown>

  for (const role of REQUIRED_ROLES) {
    if (!rules[role]) {
      throw new Error(`policy.yaml: missing rule for role "${role}"`)
    }
  }

  for (const [role, rule] of Object.entries(rules)) {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
      throw new Error(`policy.yaml: rule for role "${role}" must be an object`)
    }
    const r = rule as Record<string, unknown>
    if (!VALID_MODES.includes(r['mode'] as RuleMode)) {
      throw new Error(`policy.yaml: unknown mode "${String(r['mode'])}" for role "${role}"`)
    }
    if (r['mode'] === 'allow' || r['mode'] === 'deny') {
      if (r['packages'] !== undefined) {
        if (typeof r['packages'] !== 'object' || Array.isArray(r['packages'])) {
          throw new Error(`policy.yaml: "packages" for role "${role}" must be an object`)
        }
      }
    }
  }

  return {
    monorepoScope: parsed['monorepoScope'],
    rules: rules as Record<string, PolicyRule>,
  }
}
