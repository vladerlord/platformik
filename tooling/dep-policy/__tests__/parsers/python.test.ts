import { describe, test, expect } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { pythonParser } from '../../src/parsers/python.ts'

function withPyprojectToml(content: string, fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'dep-policy-py-test-'))
  writeFileSync(join(dir, 'pyproject.toml'), content)
  try {
    fn(dir)
  } finally {
    rmSync(dir, { recursive: true })
  }
}

describe('pythonParser', () => {
  test('extracts from multi-line [project] dependencies', () => {
    const toml = `
[project]
name = "my-package"
dependencies = [
    "pydantic>=2.0",
    "httpx",
]
`
    withPyprojectToml(toml, (dir) => {
      const deps = pythonParser.parse(dir)
      expect(deps).toContain('pydantic')
      expect(deps).toContain('httpx')
    })
  })

  test('strips version specifiers', () => {
    const toml = `
[project]
dependencies = [
    "requests>=2.28,<3.0",
    "fastapi~=0.100",
]
`
    withPyprojectToml(toml, (dir) => {
      const deps = pythonParser.parse(dir)
      expect(deps).toContain('requests')
      expect(deps).toContain('fastapi')
    })
  })

  test('extracts inline array', () => {
    const toml = `
[project]
dependencies = ["pydantic>=2.0", "httpx"]
`
    withPyprojectToml(toml, (dir) => {
      const deps = pythonParser.parse(dir)
      expect(deps).toContain('pydantic')
      expect(deps).toContain('httpx')
    })
  })

  test('returns empty array when pyproject.toml is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dep-policy-py-empty-'))
    try {
      expect(pythonParser.parse(dir)).toEqual([])
    } finally {
      rmSync(dir, { recursive: true })
    }
  })
})
