import { APP_CLIENTS, APP_ROLES, INTERNAL_SCOPE_PREFIX, LANGUAGES, PACKAGE_ROLES } from './constants.js'
import { normalizePath } from './path-utils.js'

export function parseAppDir(dir) {
  const tokens = dir.split('-')
  if (tokens.length < 4) return null

  const role = tokens[0]
  const client = tokens[1]
  const lang = tokens[tokens.length - 1]
  const moduleName = tokens.slice(2, -1).join('-')

  if (!APP_ROLES.has(role)) return null
  if (!APP_CLIENTS.has(client)) return null
  if (!moduleName) return null
  if (!LANGUAGES.has(lang)) return null

  return {
    kind: 'app',
    role,
    client,
    moduleName,
    lang,
  }
}

export function parsePackageDir(dir) {
  const tokens = dir.split('-')
  if (tokens.length < 3) return null

  const role = tokens[0]
  const lang = tokens[tokens.length - 1]
  const moduleName = tokens.slice(1, -1).join('-')

  if (!PACKAGE_ROLES.has(role)) return null
  if (!LANGUAGES.has(lang)) return null
  if (!moduleName) return null

  return {
    kind: 'package',
    role,
    moduleName,
    lang,
    boundaryKey: role,
  }
}

export function getProjectInfo(filename) {
  const normalized = normalizePath(filename)
  const parts = normalized.split('/')

  const packagesIndex = parts.indexOf('packages')
  if (packagesIndex !== -1 && parts.length > packagesIndex + 1) {
    const dir = parts[packagesIndex + 1]

    return {
      kind: 'package',
      rootDir: parts.slice(0, packagesIndex + 2).join('/'),
      dir,
      parsed: parsePackageDir(dir),
    }
  }

  const appsIndex = parts.indexOf('apps')
  if (appsIndex !== -1 && parts.length > appsIndex + 1) {
    const dir = parts[appsIndex + 1]

    return {
      kind: 'app',
      rootDir: parts.slice(0, appsIndex + 2).join('/'),
      dir,
      parsed: parseAppDir(dir),
    }
  }

  return null
}

export function parseInternalPackageImport(specifier) {
  if (!specifier.startsWith(INTERNAL_SCOPE_PREFIX)) return null

  const rest = specifier.slice(INTERNAL_SCOPE_PREFIX.length)
  const [dir, ...subpath] = rest.split('/')
  if (!dir) return null

  return { dir, subpath: subpath.join('/') || null }
}

export function projectToBoundaryKey(project) {
  if (project.kind === 'app') return project.parsed ? 'app' : null
  if (project.kind === 'package') return project.parsed?.boundaryKey ?? null

  return null
}

export function getProjectLanguage(project) {
  if (project.kind === 'app') return project.parsed?.lang ?? null
  if (project.kind === 'package') return project.parsed?.lang ?? null

  return null
}
