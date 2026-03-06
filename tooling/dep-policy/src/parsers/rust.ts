import { readFileSync } from 'fs'
import { join } from 'path'
import type { ManifestParser } from './types.ts'

export const rustParser: ManifestParser = {
  parse(packageDir: string): string[] {
    const manifestPath = join(packageDir, 'Cargo.toml')
    let raw: string
    try {
      raw = readFileSync(manifestPath, 'utf8')
    } catch {
      process.stderr.write(`[dep-policy] no Cargo.toml found in ${packageDir}, skipping\n`)

      return []
    }

    const deps: string[] = []
    let inDeps = false

    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (trimmed === '[dependencies]') {
        inDeps = true
        continue
      }
      if (trimmed.startsWith('[') && trimmed !== '[dependencies]') {
        inDeps = false
        continue
      }
      if (inDeps && trimmed && !trimmed.startsWith('#')) {
        const name = trimmed.split('=')[0].trim()
        if (name) deps.push(name)
      }
    }

    return deps
  },
}
