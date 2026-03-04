export const INTERNAL_SCOPE_PREFIX = '@platformik/'

export const VALID_MATRIX_KEYS = new Set([
  'app',
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

export const APP_ROLES = new Set(['app', 'bff', 'worker', 'service'])
// APP_CLIENTS: user-facing entrypoint types only — 'runtime' is a package role, not an app client
export const APP_CLIENTS = new Set(['web', 'cli', 'android', 'ios', 'macos'])

export const PACKAGE_ROLES = new Set([
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

export const LANGUAGES = new Set(['py', 'ts', 'go', 'rs', 'kt', 'sw'])
