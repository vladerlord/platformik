import { readFileSync } from 'fs'
import { join } from 'path'
import type { ManifestParser } from './types.ts'

export const typescriptParser: ManifestParser = {
  parse(packageDir: string): string[] {
    const manifestPath = join(packageDir, 'package.json')
    let raw: string
    try {
      raw = readFileSync(manifestPath, 'utf8')
    } catch {
      process.stderr.write(`[dep-policy] no package.json found in ${packageDir}, skipping\n`)

      return []
    }

    const pkg = JSON.parse(raw) as Record<string, unknown>
    const deps = pkg['dependencies'] as Record<string, string> | undefined
    const peerDeps = pkg['peerDependencies'] as Record<string, string> | undefined

    return [...Object.keys(deps ?? {}), ...Object.keys(peerDeps ?? {})]
  },
}
