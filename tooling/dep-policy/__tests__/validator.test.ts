import { describe, test, expect } from 'bun:test'
import { validate } from '../src/validator.ts'
import type { PolicyRule } from '../src/config.ts'

const SCOPE = '@platformik'

describe('validate — deny_all', () => {
  const rule: PolicyRule = { mode: 'deny_all' }

  test('any external dep is a violation', () => {
    const violations = validate(['pino', 'lodash'], rule, 'ts', SCOPE, 'lib')
    expect(violations).toHaveLength(2)
    expect(violations[0]?.dependency).toBe('pino')
  })

  test('no deps → no violations', () => {
    expect(validate([], rule, 'ts', SCOPE, 'lib')).toEqual([])
  })

  test('monorepo-scoped deps are filtered out from external check', () => {
    expect(validate(['@platformik/lib-fp-ts'], rule, 'ts', SCOPE, 'lib')).toEqual([])
  })
})

describe('validate — allow', () => {
  const rule: PolicyRule = { mode: 'allow', packages: { ts: ['neverthrow'] } }

  test('listed dep passes', () => {
    expect(validate(['neverthrow'], rule, 'ts', SCOPE, 'lib')).toEqual([])
  })

  test('unlisted dep is a violation', () => {
    const violations = validate(['lodash'], rule, 'ts', SCOPE, 'lib')
    expect(violations).toHaveLength(1)
    expect(violations[0]?.dependency).toBe('lodash')
  })

  test('monorepo internal deps are ignored for external check', () => {
    expect(validate(['@platformik/lib-fp-ts', 'neverthrow'], rule, 'ts', SCOPE, 'lib')).toEqual([])
  })

  test('language not listed → treats as empty allowlist (no external deps allowed)', () => {
    const violations = validate(['pydantic'], rule, 'py', SCOPE, 'lib')
    expect(violations).toHaveLength(1)
  })
})

describe('validate — deny', () => {
  const rule: PolicyRule = { mode: 'deny', packages: { ts: ['pg', 'ioredis'] } }

  test('listed dep is a violation', () => {
    const violations = validate(['pg'], rule, 'ts', SCOPE, 'module')
    expect(violations).toHaveLength(1)
    expect(violations[0]?.dependency).toBe('pg')
  })

  test('unlisted dep passes', () => {
    expect(validate(['zod', 'lodash'], rule, 'ts', SCOPE, 'module')).toEqual([])
  })

  test('language not listed → no deps blocked', () => {
    expect(validate(['pg', 'serde'], rule, 'rs', SCOPE, 'module')).toEqual([])
  })
})

describe('validate — allow_any', () => {
  const rule: PolicyRule = { mode: 'allow_any' }

  test('everything passes', () => {
    expect(validate(['pino', 'pg', 'fastify', 'kafka'], rule, 'ts', SCOPE, 'module')).toEqual([])
  })
})

describe('validate — dependency flow', () => {
  const rule: PolicyRule = { mode: 'allow_any' }

  test('module → module is a violation', () => {
    const deps = ['@platformik/module-billing-ts']
    const violations = validate(deps, rule, 'ts', SCOPE, 'module')
    expect(violations).toHaveLength(1)
    expect(violations[0]?.dependency).toBe('@platformik/module-billing-ts')
    expect(violations[0]?.reason).toContain('"module" cannot depend on "module"')
  })

  test('module → lib is allowed', () => {
    const deps = ['@platformik/lib-fp-ts']
    expect(validate(deps, rule, 'ts', SCOPE, 'module')).toEqual([])
  })

  test('module → runtime is allowed', () => {
    const deps = ['@platformik/runtime-postgres-ts']
    expect(validate(deps, rule, 'ts', SCOPE, 'module')).toEqual([])
  })

  test('module → vendor is allowed', () => {
    const deps = ['@platformik/vendor-openai-ts']
    expect(validate(deps, rule, 'ts', SCOPE, 'module')).toEqual([])
  })

  test('contracts → runtime is a violation', () => {
    const deps = ['@platformik/runtime-postgres-ts']
    const violations = validate(deps, rule, 'ts', SCOPE, 'contracts')
    expect(violations).toHaveLength(1)
    expect(violations[0]?.reason).toContain('"contracts" cannot depend on "runtime"')
  })

  test('contracts → lib is allowed', () => {
    const deps = ['@platformik/lib-fp-ts']
    expect(validate(deps, rule, 'ts', SCOPE, 'contracts')).toEqual([])
  })

  test('lib → lib is allowed', () => {
    const deps = ['@platformik/lib-logger-ts']
    expect(validate(deps, rule, 'ts', SCOPE, 'lib')).toEqual([])
  })

  test('lib → runtime is a violation', () => {
    const deps = ['@platformik/runtime-postgres-ts']
    const violations = validate(deps, rule, 'ts', SCOPE, 'lib')
    expect(violations).toHaveLength(1)
    expect(violations[0]?.reason).toContain('"lib" cannot depend on "runtime"')
  })

  test('app → module is allowed', () => {
    const deps = ['@platformik/module-iam-ts']
    expect(validate(deps, rule, 'ts', SCOPE, 'app')).toEqual([])
  })

  test('runtime → lib is allowed', () => {
    const deps = ['@platformik/lib-fp-ts']
    expect(validate(deps, rule, 'ts', SCOPE, 'runtime')).toEqual([])
  })

  test('runtime → vendor is a violation', () => {
    const deps = ['@platformik/vendor-openai-ts']
    const violations = validate(deps, rule, 'ts', SCOPE, 'runtime')
    expect(violations).toHaveLength(1)
    expect(violations[0]?.reason).toContain('"runtime" cannot depend on "vendor"')
  })
})
