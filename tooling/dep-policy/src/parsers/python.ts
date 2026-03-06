import { readFileSync } from 'fs'
import { join } from 'path'
import type { ManifestParser } from './types.ts'

function extractPkgName(entry: string): string {
  // strip quotes, trailing commas, then take name up to version specifier
  const stripped = entry.replace(/^["']|["',\s]+$/g, '')
  const match = stripped.match(/^[A-Za-z0-9._-]+/)

  return match ? match[0] : ''
}

export const pythonParser: ManifestParser = {
  parse(packageDir: string): string[] {
    const manifestPath = join(packageDir, 'pyproject.toml')
    let raw: string
    try {
      raw = readFileSync(manifestPath, 'utf8')
    } catch {
      process.stderr.write(`[dep-policy] no pyproject.toml found in ${packageDir}, skipping\n`)

      return []
    }

    const deps: string[] = []
    let inProject = false
    let inDepsArray = false

    for (const line of raw.split('\n')) {
      const trimmed = line.trim()

      if (trimmed.startsWith('[')) {
        inProject = trimmed === '[project]'
        inDepsArray = false
        continue
      }

      if (inProject && trimmed.startsWith('dependencies')) {
        // inline: dependencies = ["pydantic", "httpx"]
        const inlineMatch = trimmed.match(/dependencies\s*=\s*\[(.+)\]/)
        if (inlineMatch) {
          const entries = inlineMatch[1].split(',')
          for (const e of entries) {
            const name = extractPkgName(e.trim())
            if (name) deps.push(name)
          }
          continue
        }
        // multi-line start: dependencies = [
        if (trimmed.endsWith('[')) {
          inDepsArray = true
          continue
        }
      }

      if (inDepsArray) {
        if (trimmed === ']') {
          inDepsArray = false
          continue
        }
        if (trimmed && !trimmed.startsWith('#')) {
          const name = extractPkgName(trimmed)
          if (name) deps.push(name)
        }
      }
    }

    return deps
  },
}
