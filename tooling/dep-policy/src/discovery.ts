import { readdirSync, statSync } from 'fs'
import { join } from 'path'
import type { PolicyConfig } from './config.ts'

export interface DiscoveryVocab {
  langs: ReadonlySet<string>
  schemas: ReadonlySet<string>
  packageRoles: ReadonlySet<string>
}

export interface PackageInfo {
  role: string
  name: string
  suffix: string
  kind: 'lang' | 'schema'
  path: string
  dirName: string
}

export function vocabFromConfig(config: PolicyConfig): DiscoveryVocab {
  return {
    langs: new Set(config.langs),
    schemas: new Set(config.schemas),
    packageRoles: new Set(config.packageRoles),
  }
}

export function classifyPackage(
  dirName: string,
  vocab: DiscoveryVocab,
): { role: string; name: string; suffix: string; kind: 'lang' | 'schema' } | null {
  const tokens = dirName.split('-')
  if (tokens.length < 3) return null
  const role = tokens[0]
  const suffix = tokens[tokens.length - 1]
  const name = tokens.slice(1, -1).join('-')
  if (!role || !suffix || !name) return null
  if (!vocab.packageRoles.has(role)) return null

  if (vocab.langs.has(suffix)) return { role, name, suffix, kind: 'lang' }
  if (vocab.schemas.has(suffix)) return { role, name, suffix, kind: 'schema' }

  return null
}

export function classifyApp(
  dirName: string,
  vocab: Pick<DiscoveryVocab, 'langs'>,
): { role: string; name: string; suffix: string; kind: 'lang' } | null {
  const tokens = dirName.split('-')
  if (tokens.length < 2) return null
  const suffix = tokens[tokens.length - 1]
  const name = tokens.slice(0, -1).join('-')
  if (!suffix || !name) return null
  if (!vocab.langs.has(suffix)) return null

  return { role: 'app', name, suffix, kind: 'lang' }
}

function listDirs(dir: string): string[] {
  return readdirSync(dir).filter((name) => {
    try {
      return statSync(join(dir, name)).isDirectory()
    } catch {
      return false
    }
  })
}

export function discoverPackages(root: string, config: PolicyConfig): PackageInfo[] {
  const vocab = vocabFromConfig(config)
  const results: PackageInfo[] = []

  for (const dirName of listDirs(join(root, 'packages'))) {
    const classified = classifyPackage(dirName, vocab)
    if (!classified) {
      process.stderr.write(
        `[dep-policy] skipping packages/${dirName}: does not match <role>-<n>-<lang|schema> pattern\n`,
      )
      continue
    }
    results.push({ ...classified, dirName, path: join(root, 'packages', dirName) })
  }

  for (const dirName of listDirs(join(root, 'apps'))) {
    const classified = classifyApp(dirName, vocab)
    if (!classified) {
      process.stderr.write(`[dep-policy] skipping apps/${dirName}: does not match <anything>-<lang> pattern\n`)
      continue
    }
    results.push({ ...classified, dirName, path: join(root, 'apps', dirName) })
  }

  return results
}
