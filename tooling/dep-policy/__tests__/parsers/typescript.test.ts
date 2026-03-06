import { describe, test, expect } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { typescriptParser } from '../../src/parsers/typescript.ts'

function withPackageJson(content: object, fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'dep-policy-ts-test-'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify(content))
  try {
    fn(dir)
  } finally {
    rmSync(dir, { recursive: true })
  }
}

describe('typescriptParser', () => {
  test('extracts dependencies', () => {
    withPackageJson({ dependencies: { zod: '^3.0.0', lodash: '^4.0.0' } }, (dir) => {
      expect(typescriptParser.parse(dir)).toEqual(['zod', 'lodash'])
    })
  })

  test('extracts peerDependencies', () => {
    withPackageJson({ peerDependencies: { react: '^18.0.0' } }, (dir) => {
      expect(typescriptParser.parse(dir)).toContain('react')
    })
  })

  test('does not include devDependencies', () => {
    withPackageJson({ devDependencies: { vitest: '^1.0.0' } }, (dir) => {
      expect(typescriptParser.parse(dir)).not.toContain('vitest')
    })
  })

  test('handles missing dependencies field gracefully', () => {
    withPackageJson({ name: '@mono/lib-fp-ts' }, (dir) => {
      expect(typescriptParser.parse(dir)).toEqual([])
    })
  })

  test('returns empty array when package.json is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dep-policy-ts-empty-'))
    try {
      expect(typescriptParser.parse(dir)).toEqual([])
    } finally {
      rmSync(dir, { recursive: true })
    }
  })

  test('combines dependencies and peerDependencies', () => {
    withPackageJson({ dependencies: { zod: '^3.0.0' }, peerDependencies: { react: '^18.0.0' } }, (dir) => {
      const deps = typescriptParser.parse(dir)
      expect(deps).toContain('zod')
      expect(deps).toContain('react')
    })
  })
})
