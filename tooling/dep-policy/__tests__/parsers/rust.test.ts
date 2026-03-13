import { describe, test, expect } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { rustParser } from '../../src/parsers/rust.ts'

function withCargoToml(content: string, fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'dep-policy-rs-test-'))
  writeFileSync(join(dir, 'Cargo.toml'), content)
  try {
    fn(dir)
  } finally {
    rmSync(dir, { recursive: true })
  }
}

describe('rustParser', () => {
  test('extracts [dependencies]', () => {
    const toml = `
[package]
name = "my-crate"

[dependencies]
serde = "1.0"
sqlx = { version = "0.7", features = ["postgres"] }
`
    withCargoToml(toml, (dir) => {
      const deps = rustParser.parse(dir)
      expect(deps).toContain('serde')
      expect(deps).toContain('sqlx')
    })
  })

  test('ignores [dev-dependencies]', () => {
    const toml = `
[dependencies]
serde = "1.0"

[dev-dependencies]
mockall = "0.11"
`
    withCargoToml(toml, (dir) => {
      const deps = rustParser.parse(dir)
      expect(deps).toContain('serde')
      expect(deps).not.toContain('mockall')
    })
  })

  test('returns empty array when Cargo.toml is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dep-policy-rs-empty-'))
    try {
      expect(rustParser.parse(dir)).toEqual([])
    } finally {
      rmSync(dir, { recursive: true })
    }
  })

  test('handles empty [dependencies] section', () => {
    const toml = `
[package]
name = "empty"

[dependencies]
`
    withCargoToml(toml, (dir) => {
      expect(rustParser.parse(dir)).toEqual([])
    })
  })
})
