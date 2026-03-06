import { readdirSync, statSync } from 'fs'
import { join } from 'path'

const VALID_LANGS = new Set(['ts', 'py', 'go', 'rs', 'kt', 'sw'])
const VALID_SCHEMAS = new Set(['proto', 'jsonschema'])
const VALID_PACKAGE_ROLES = new Set([
  'lib',
  'domain',
  'ports',
  'contracts',
  'module',
  'workflows',
  'adapter',
  'runtime',
  'vendor',
  'migrations',
  'testkit',
])

export interface PackageInfo {
  role: string
  name: string
  suffix: string
  kind: 'lang' | 'schema'
  path: string
  dirName: string
}

export function classifyPackage(
  dirName: string,
): { role: string; name: string; suffix: string; kind: 'lang' | 'schema' } | null {
  const tokens = dirName.split('-')
  if (tokens.length < 3) return null
  const role = tokens[0]
  const suffix = tokens[tokens.length - 1]
  const name = tokens.slice(1, -1).join('-')
  if (!role || !suffix || !name) return null
  if (!VALID_PACKAGE_ROLES.has(role)) return null

  if (VALID_LANGS.has(suffix)) return { role, name, suffix, kind: 'lang' }
  if (VALID_SCHEMAS.has(suffix)) return { role, name, suffix, kind: 'schema' }

  return null
}

export function classifyApp(dirName: string): { role: string; name: string; suffix: string; kind: 'lang' } | null {
  const tokens = dirName.split('-')
  if (tokens.length < 2) return null
  const suffix = tokens[tokens.length - 1]
  const name = tokens.slice(0, -1).join('-')
  if (!suffix || !name) return null
  if (!VALID_LANGS.has(suffix)) return null

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

export function discoverPackages(root: string): PackageInfo[] {
  const results: PackageInfo[] = []

  for (const dirName of listDirs(join(root, 'packages'))) {
    const classified = classifyPackage(dirName)
    if (!classified) {
      process.stderr.write(
        `[dep-policy] skipping packages/${dirName}: does not match <role>-<n>-<lang|schema> pattern\n`,
      )
      continue
    }
    results.push({ ...classified, dirName, path: join(root, 'packages', dirName) })
  }

  for (const dirName of listDirs(join(root, 'apps'))) {
    const classified = classifyApp(dirName)
    if (!classified) {
      process.stderr.write(`[dep-policy] skipping apps/${dirName}: does not match <anything>-<lang> pattern\n`)
      continue
    }
    results.push({ ...classified, dirName, path: join(root, 'apps', dirName) })
  }

  return results
}
