export const INTERNAL_SCOPE_PREFIX = '@platformik/'

export const VALID_MATRIX_KEYS = new Set([
  'app',
  'domain',
  'workflows',
  'infra',
  'platform',
  'provider',
  'migrations',
  'shared',
])

export const APP_ROLES = new Set(['app', 'bff', 'worker', 'service'])
export const APP_CLIENTS = new Set(['web', 'cli', 'android', 'ios', 'macos', 'runtime'])
export const PACKAGE_ROLES = new Set(['domain', 'workflows', 'infra', 'platform', 'provider', 'migrations'])

export const LANGUAGES = new Set(['py', 'ts', 'go', 'rs', 'kt', 'sw'])
