import { describe, test, expect } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { loadConfig } from '../src/config.ts'

function withTempConfig(content: string, fn: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'dep-policy-test-'))
  const configPath = join(dir, 'policy.yaml')
  writeFileSync(configPath, content)
  try {
    fn(configPath)
  } finally {
    rmSync(dir, { recursive: true })
  }
}

const VALID_CONFIG = `
monorepoScope: '@platformik'
rules:
  lib:
    mode: allow
    packages:
      ts: [neverthrow]
  module:
    mode: allow_any
  contracts:
    mode: allow
    packages:
      ts: [zod]
  runtime:
    mode: allow_any
  vendor:
    mode: allow_any
  app:
    mode: allow_any
`

describe('loadConfig', () => {
  test('parses a valid config', () => {
    withTempConfig(VALID_CONFIG, (path) => {
      const config = loadConfig(path)
      expect(config.monorepoScope).toBe('@platformik')
      expect(config.rules['lib']).toEqual({ mode: 'allow', packages: { ts: ['neverthrow'] } })
      expect(config.rules['contracts']).toEqual({
        mode: 'allow',
        packages: { ts: ['zod'] },
      })
    })
  })

  test('throws if monorepoScope is missing', () => {
    const yaml = VALID_CONFIG.replace("monorepoScope: '@platformik'", '')
    withTempConfig(yaml, (path) => {
      expect(() => loadConfig(path)).toThrow('monorepoScope')
    })
  })

  test('throws if rules is missing', () => {
    const yaml = `monorepoScope: '@platformik'`
    withTempConfig(yaml, (path) => {
      expect(() => loadConfig(path)).toThrow('rules')
    })
  })

  test('throws if a required role is missing', () => {
    const yaml = VALID_CONFIG.replace('  lib:\n    mode: allow\n    packages:\n      ts: [neverthrow]\n', '')
    withTempConfig(yaml, (path) => {
      expect(() => loadConfig(path)).toThrow('missing rule for role "lib"')
    })
  })

  test('throws on unknown mode', () => {
    const yaml = VALID_CONFIG.replace('mode: allow_any\n  contracts', 'mode: invalid\n  contracts')
    withTempConfig(yaml, (path) => {
      expect(() => loadConfig(path)).toThrow('unknown mode')
    })
  })
})
