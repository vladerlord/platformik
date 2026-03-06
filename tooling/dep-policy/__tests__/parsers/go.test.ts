import { describe, test, expect } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { goParser } from '../../src/parsers/go.ts'

function withGoMod(content: string, fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'dep-policy-go-test-'))
  writeFileSync(join(dir, 'go.mod'), content)
  try {
    fn(dir)
  } finally {
    rmSync(dir, { recursive: true })
  }
}

describe('goParser', () => {
  test('extracts from require (...) block', () => {
    const gomod = `
module example.com/myapp

go 1.21

require (
  github.com/gin-gonic/gin v1.9.0
  google.golang.org/protobuf v1.31.0
)
`
    withGoMod(gomod, (dir) => {
      const deps = goParser.parse(dir)
      expect(deps).toContain('github.com/gin-gonic/gin')
      expect(deps).toContain('google.golang.org/protobuf')
    })
  })

  test('extracts single-line require', () => {
    const gomod = `
module example.com/myapp

go 1.21

require github.com/pkg/errors v0.9.1
`
    withGoMod(gomod, (dir) => {
      expect(goParser.parse(dir)).toContain('github.com/pkg/errors')
    })
  })

  test('returns empty array when go.mod is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dep-policy-go-empty-'))
    try {
      expect(goParser.parse(dir)).toEqual([])
    } finally {
      rmSync(dir, { recursive: true })
    }
  })

  test('handles empty require block', () => {
    const gomod = `
module example.com/myapp

go 1.21

require (
)
`
    withGoMod(gomod, (dir) => {
      expect(goParser.parse(dir)).toEqual([])
    })
  })
})
