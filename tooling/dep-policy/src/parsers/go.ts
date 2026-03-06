import { readFileSync } from 'fs'
import { join } from 'path'
import type { ManifestParser } from './types.ts'

export const goParser: ManifestParser = {
  parse(packageDir: string): string[] {
    const manifestPath = join(packageDir, 'go.mod')
    let raw: string
    try {
      raw = readFileSync(manifestPath, 'utf8')
    } catch {
      process.stderr.write(`[dep-policy] no go.mod found in ${packageDir}, skipping\n`)

      return []
    }

    const deps: string[] = []
    let inRequireBlock = false

    for (const line of raw.split('\n')) {
      const trimmed = line.trim()

      if (trimmed === 'require (') {
        inRequireBlock = true
        continue
      }
      if (trimmed === ')') {
        inRequireBlock = false
        continue
      }

      if (inRequireBlock && trimmed && !trimmed.startsWith('//')) {
        const parts = trimmed.split(/\s+/)
        if (parts[0]) deps.push(parts[0])
        continue
      }

      // single-line: require module version
      if (trimmed.startsWith('require ') && !trimmed.includes('(')) {
        const rest = trimmed.slice('require '.length).trim()
        const parts = rest.split(/\s+/)
        if (parts[0]) deps.push(parts[0])
      }
    }

    return deps
  },
}
