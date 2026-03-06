import { describe, test, expect } from 'bun:test'
import { join } from 'path'
import { loadConfig } from '../src/config.ts'
import { discoverPackages } from '../src/discovery.ts'
import { typescriptParser } from '../src/parsers/typescript.ts'
import { validate } from '../src/validator.ts'
import { report, type PackageViolations } from '../src/reporter.ts'

const FIXTURES_ROOT = join(import.meta.dir, '../__fixtures__')
const FIXTURES_POLICY = join(FIXTURES_ROOT, 'policy.yaml')

const PARSERS: Record<string, { parse(dir: string): string[] }> = {
  ts: typescriptParser,
}

function runPipeline(): PackageViolations[] {
  const policy = loadConfig(FIXTURES_POLICY)
  const packages = discoverPackages(FIXTURES_ROOT)
  const results: PackageViolations[] = []

  for (const pkg of packages) {
    if (pkg.kind === 'schema') continue

    const rule = policy.rules[pkg.role]
    if (!rule) continue
    const parser = PARSERS[pkg.suffix]
    if (!parser) continue
    const deps = parser.parse(pkg.path)
    const violations = validate(deps, rule, pkg.suffix, policy.monorepoScope, pkg.role)
    results.push({ pkgPath: pkg.dirName, role: pkg.role, mode: rule.mode, violations })
  }

  return results
}

describe('integration', () => {
  test('module-chat-ts has violation for depending on another module', () => {
    const results = runPipeline()
    const chat = results.find((r) => r.pkgPath === 'module-chat-ts')
    expect(chat).toBeDefined()
    expect(chat?.violations.map((v) => v.dependency)).toContain('@platformik/module-iam-ts')
  })

  test('module-iam-ts has no violations (lib and runtime deps are allowed)', () => {
    const results = runPipeline()
    const iam = results.find((r) => r.pkgPath === 'module-iam-ts')
    expect(iam?.violations).toEqual([])
  })

  test('lib-fp-ts has no violations (neverthrow is allowed)', () => {
    const results = runPipeline()
    const lib = results.find((r) => r.pkgPath === 'lib-fp-ts')
    expect(lib?.violations).toEqual([])
  })

  test('lib-logger-ts has no violations (no external deps)', () => {
    const results = runPipeline()
    const lib = results.find((r) => r.pkgPath === 'lib-logger-ts')
    expect(lib?.violations).toEqual([])
  })

  test('contracts-platform-api-ts has no violations (zod is allowed)', () => {
    const results = runPipeline()
    const contracts = results.find((r) => r.pkgPath === 'contracts-platform-api-ts')
    expect(contracts?.violations).toEqual([])
  })

  test('contracts-ai-proto is skipped (schema package)', () => {
    const results = runPipeline()
    const proto = results.find((r) => r.pkgPath === 'contracts-ai-proto')
    expect(proto).toBeUndefined()
  })

  test('runtime-postgres-ts has no violations (allow_any)', () => {
    const results = runPipeline()
    const runtime = results.find((r) => r.pkgPath === 'runtime-postgres-ts')
    expect(runtime?.violations).toEqual([])
  })

  test('vendor-openai-ts has no violations (allow_any)', () => {
    const results = runPipeline()
    const vendor = results.find((r) => r.pkgPath === 'vendor-openai-ts')
    expect(vendor?.violations).toEqual([])
  })

  test('service-api-ts (app) has no violations', () => {
    const results = runPipeline()
    const app = results.find((r) => r.pkgPath === 'service-api-ts')
    expect(app?.violations).toEqual([])
  })

  test('report output mentions violation count', () => {
    const results = runPipeline()
    const output = report(results)
    expect(output).toContain('violation')
    expect(output).toContain('module-chat-ts')
  })

  test('report output is clean when no violations', () => {
    const clean: PackageViolations[] = [{ pkgPath: 'lib-fp-ts', role: 'lib', mode: 'allow', violations: [] }]
    expect(report(clean)).toBe('All packages pass dependency policy checks.')
  })
})
