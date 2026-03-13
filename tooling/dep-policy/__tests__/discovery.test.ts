import { describe, test, expect } from 'vitest'
import { classifyPackage, classifyApp, discoverPackages, type DiscoveryVocab } from '../src/discovery.ts'
import { loadConfig } from '../src/config.ts'
import { mkdtempSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { fileURLToPath } from 'url'

const FIXTURES_ROOT = fileURLToPath(new URL('../__fixtures__', import.meta.url))
const FIXTURE_CONFIG = loadConfig(join(FIXTURES_ROOT, 'policy.yaml'))

const TEST_VOCAB: DiscoveryVocab = {
  langs: new Set(FIXTURE_CONFIG.langs),
  schemas: new Set(FIXTURE_CONFIG.schemas),
  packageRoles: new Set(FIXTURE_CONFIG.packageRoles),
}

describe('classifyPackage', () => {
  test('classifies module-iam-ts', () => {
    expect(classifyPackage('module-iam-ts', TEST_VOCAB)).toEqual({
      role: 'module',
      name: 'iam',
      suffix: 'ts',
      kind: 'lang',
    })
  })

  test('classifies lib-fp-ts', () => {
    expect(classifyPackage('lib-fp-ts', TEST_VOCAB)).toEqual({
      role: 'lib',
      name: 'fp',
      suffix: 'ts',
      kind: 'lang',
    })
  })

  test('classifies runtime-postgres-ts', () => {
    expect(classifyPackage('runtime-postgres-ts', TEST_VOCAB)).toEqual({
      role: 'runtime',
      name: 'postgres',
      suffix: 'ts',
      kind: 'lang',
    })
  })

  test('classifies contracts-ai-proto as schema', () => {
    expect(classifyPackage('contracts-ai-proto', TEST_VOCAB)).toEqual({
      role: 'contracts',
      name: 'ai',
      suffix: 'proto',
      kind: 'schema',
    })
  })

  test('classifies contracts-platform-jsonschema as schema', () => {
    expect(classifyPackage('contracts-platform-jsonschema', TEST_VOCAB)).toEqual({
      role: 'contracts',
      name: 'platform',
      suffix: 'jsonschema',
      kind: 'schema',
    })
  })

  test('classifies multi-word name like module-flow-store-ts', () => {
    expect(classifyPackage('module-flow-store-ts', TEST_VOCAB)).toEqual({
      role: 'module',
      name: 'flow-store',
      suffix: 'ts',
      kind: 'lang',
    })
  })

  test('returns null for too-short name', () => {
    expect(classifyPackage('lib-ts', TEST_VOCAB)).toBeNull()
  })

  test('returns null for a bare name', () => {
    expect(classifyPackage('libts', TEST_VOCAB)).toBeNull()
  })

  test('returns null for unknown suffix', () => {
    expect(classifyPackage('lib-fp-java', TEST_VOCAB)).toBeNull()
  })

  test('returns null for invalid package role', () => {
    expect(classifyPackage('app-foo-ts', TEST_VOCAB)).toBeNull()
  })
})

describe('classifyApp', () => {
  test('classifies service-api-ts', () => {
    expect(classifyApp('service-api-ts', TEST_VOCAB)).toEqual({
      role: 'app',
      name: 'service-api',
      suffix: 'ts',
      kind: 'lang',
    })
  })

  test('classifies bff-web-platform-ts', () => {
    expect(classifyApp('bff-web-platform-ts', TEST_VOCAB)).toEqual({
      role: 'app',
      name: 'bff-web-platform',
      suffix: 'ts',
      kind: 'lang',
    })
  })

  test('classifies cli-platform-rs', () => {
    expect(classifyApp('cli-platform-rs', TEST_VOCAB)).toEqual({
      role: 'app',
      name: 'cli-platform',
      suffix: 'rs',
      kind: 'lang',
    })
  })

  test('returns null for bare name with no hyphen', () => {
    expect(classifyApp('service', TEST_VOCAB)).toBeNull()
  })

  test('returns null for unknown suffix', () => {
    expect(classifyApp('service-api-java', TEST_VOCAB)).toBeNull()
  })
})

describe('discoverPackages', () => {
  test('discovers packages and apps from fixtures root', () => {
    const pkgs = discoverPackages(FIXTURES_ROOT, FIXTURE_CONFIG)
    const dirNames = pkgs.map((p) => p.dirName)

    expect(dirNames).toContain('lib-fp-ts')
    expect(dirNames).toContain('lib-logger-ts')
    expect(dirNames).toContain('module-iam-ts')
    expect(dirNames).toContain('module-chat-ts')
    expect(dirNames).toContain('contracts-platform-api-ts')
    expect(dirNames).toContain('contracts-ai-proto')
    expect(dirNames).toContain('runtime-postgres-ts')
    expect(dirNames).toContain('vendor-openai-ts')
    expect(dirNames).toContain('service-api-ts')
  })

  test('apps get role "app"', () => {
    const pkgs = discoverPackages(FIXTURES_ROOT, FIXTURE_CONFIG)
    const app = pkgs.find((p) => p.dirName === 'service-api-ts')
    expect(app?.role).toBe('app')
    expect(app?.suffix).toBe('ts')
    expect(app?.kind).toBe('lang')
  })

  test('packages get correct role, suffix, and kind', () => {
    const pkgs = discoverPackages(FIXTURES_ROOT, FIXTURE_CONFIG)
    const mod = pkgs.find((p) => p.dirName === 'module-iam-ts')
    expect(mod?.role).toBe('module')
    expect(mod?.suffix).toBe('ts')
    expect(mod?.kind).toBe('lang')
  })

  test('schema packages get kind "schema"', () => {
    const pkgs = discoverPackages(FIXTURES_ROOT, FIXTURE_CONFIG)
    const proto = pkgs.find((p) => p.dirName === 'contracts-ai-proto')
    expect(proto?.role).toBe('contracts')
    expect(proto?.suffix).toBe('proto')
    expect(proto?.kind).toBe('schema')
  })

  test('throws when packages directory cannot be read', () => {
    const root = mkdtempSync(join(tmpdir(), 'dep-policy-discovery-test-'))
    mkdirSync(join(root, 'apps'))

    try {
      expect(() => discoverPackages(root, FIXTURE_CONFIG)).toThrow(/ENOENT/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
