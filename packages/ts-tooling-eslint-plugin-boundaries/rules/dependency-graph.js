import path from 'node:path'

const INTERNAL_SCOPE_PREFIX = '@platformik/'

const BOUNDED_ROLES = new Set(['domain', 'workflows', 'infra', 'migrations'])
const SHARED_GROUPS = new Set(['lib', 'infra', 'platform', 'tooling'])

const VALID_KEYS = new Set([
  'app',
  'bounded:domain',
  'bounded:workflows',
  'bounded:infra',
  'bounded:migrations',
  'shared:lib',
  'shared:infra',
  'shared:platform',
  'shared:tooling',
])

function normalizePath(absolutePath) {
  return path.resolve(absolutePath).replaceAll(path.sep, '/')
}

function findWorkspaceRootFromFilename(filename) {
  const parts = normalizePath(filename).split('/')
  const appsIndex = parts.indexOf('apps')
  const packagesIndex = parts.indexOf('packages')

  let index = appsIndex
  if (index === -1) index = packagesIndex
  if (index !== -1 && packagesIndex !== -1) index = Math.min(index, packagesIndex)

  if (index === -1) return null

  return parts.slice(0, index).join('/')
}

function getProjectInfo(filename) {
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
      parsed: null,
    }
  }

  return null
}

function parsePackageDir(dir) {
  const tokens = dir.split('-')
  if (tokens.length < 3) return null

  const lang = tokens[0]
  const groupOrContext = tokens[1]

  if (SHARED_GROUPS.has(groupOrContext)) {
    const name = tokens.slice(2).join('-')
    if (!name) return null

    return {
      kind: 'shared',
      lang,
      group: groupOrContext,
      name,
    }
  }

  const role = tokens[tokens.length - 1]
  if (!BOUNDED_ROLES.has(role)) return null

  const context = tokens.slice(1, -1).join('-')
  if (!context) return null

  return {
    kind: 'bounded',
    lang,
    context,
    role,
  }
}

function extractStaticImportSource(nodeSource) {
  if (!nodeSource) return null
  if (nodeSource.type === 'Literal' && typeof nodeSource.value === 'string') return nodeSource.value
  if (nodeSource.type === 'TemplateLiteral' && nodeSource.expressions.length === 0) {
    return nodeSource.quasis[0]?.value?.cooked ?? null
  }

  return null
}

function parseInternalPackageImport(specifier) {
  if (!specifier.startsWith(INTERNAL_SCOPE_PREFIX)) return null
  const rest = specifier.slice(INTERNAL_SCOPE_PREFIX.length)
  const [dir, ...subpath] = rest.split('/')
  if (!dir) return null

  return { dir, subpath: subpath.join('/') || null }
}

function getLangForFromProject(fromProject) {
  if (fromProject.kind === 'package') return fromProject.parsed?.lang ?? null
  if (fromProject.kind === 'app') return 'ts'

  return null
}

function projectToKey(project) {
  if (project.kind === 'app') return 'app'
  if (project.kind !== 'package' || !project.parsed) return null

  if (project.parsed.kind === 'bounded') return `bounded:${project.parsed.role}`
  if (project.parsed.kind === 'shared') return `shared:${project.parsed.group}`

  return null
}

function normalizeMatrix(rawMatrix) {
  if (!rawMatrix || typeof rawMatrix !== 'object') {
    return { ok: false, reason: 'matrix must be an object' }
  }

  const normalized = {}

  for (const key of VALID_KEYS) {
    const entry = rawMatrix[key]
    if (!entry || typeof entry !== 'object') {
      return { ok: false, reason: `matrix is missing required key "${key}"` }
    }

    const allowAll = entry.allowAll === true
    const allow = allowAll ? [] : entry.allow
    if (!allowAll && !Array.isArray(allow)) {
      return { ok: false, reason: `matrix["${key}"].allow must be an array` }
    }

    for (const toKey of allow) {
      if (!VALID_KEYS.has(toKey)) {
        return { ok: false, reason: `matrix["${key}"].allow contains unknown key "${toKey}"` }
      }
    }

    const crossContextAllowedTo = entry.crossContextAllowedTo ?? []
    if (!Array.isArray(crossContextAllowedTo)) {
      return { ok: false, reason: `matrix["${key}"].crossContextAllowedTo must be an array` }
    }
    for (const toKey of crossContextAllowedTo) {
      if (!VALID_KEYS.has(toKey)) {
        return { ok: false, reason: `matrix["${key}"].crossContextAllowedTo contains unknown key "${toKey}"` }
      }
      if (!allowAll && !allow.includes(toKey)) {
        return { ok: false, reason: `matrix["${key}"].crossContextAllowedTo must be a subset of allow` }
      }
    }

    const requireSameContextTo = entry.requireSameContextTo ?? []
    if (!Array.isArray(requireSameContextTo)) {
      return { ok: false, reason: `matrix["${key}"].requireSameContextTo must be an array` }
    }
    for (const toKey of requireSameContextTo) {
      if (!VALID_KEYS.has(toKey)) {
        return { ok: false, reason: `matrix["${key}"].requireSameContextTo contains unknown key "${toKey}"` }
      }
      if (!allowAll && !allow.includes(toKey)) {
        return { ok: false, reason: `matrix["${key}"].requireSameContextTo must be a subset of allow` }
      }
    }

    normalized[key] = {
      allowAll,
      allow: allowAll ? null : new Set(allow),
      denyReason: typeof entry.denyReason === 'string' ? entry.denyReason : null,
      crossContextAllowedTo: new Set(crossContextAllowedTo),
      requireSameContextTo: new Set(requireSameContextTo),
    }
  }

  for (const key of Object.keys(rawMatrix)) {
    if (!VALID_KEYS.has(key)) {
      return { ok: false, reason: `matrix contains unknown key "${key}"` }
    }
  }

  return { ok: true, matrix: normalized }
}

function validateEdge({ from, to, matrix }) {
  if (from.kind === 'app' && to.kind !== 'package') {
    return { ok: false, reason: 'apps must not depend on other apps' }
  }

  if (from.kind === 'package' && to.kind !== 'package') {
    return { ok: false, reason: 'packages must not depend on apps' }
  }

  if (from.kind === 'package' && to.kind === 'package' && from.dir === to.dir) {
    return { ok: true }
  }

  const fromKey = projectToKey(from)
  const toKey = projectToKey(to)
  if (!fromKey) return { ok: false, reason: 'source package name is not classifiable by naming rules' }
  if (!toKey) return { ok: false, reason: 'target package name is not classifiable by naming rules' }

  const fromLang = getLangForFromProject(from)
  const toLang = to.kind === 'package' ? (to.parsed?.lang ?? null) : null
  if (fromLang && toLang && fromLang !== toLang) {
    return { ok: false, reason: 'cross-language source imports are forbidden' }
  }

  const rule = matrix[fromKey]
  if (!rule) return { ok: false, reason: 'no boundary rule exists for this package kind' }

  if (!rule.allowAll && !rule.allow.has(toKey)) {
    return { ok: false, reason: rule.denyReason || 'dependency is not allowed by the boundary rules' }
  }

  if (rule.requireSameContextTo.has(toKey)) {
    const fromContext = from.kind === 'package' ? (from.parsed?.context ?? null) : null
    const toContext = to.kind === 'package' ? (to.parsed?.context ?? null) : null
    if (!fromContext || !toContext || fromContext !== toContext) {
      return { ok: false, reason: 'dependency requires same bounded context' }
    }
  }

  const isBoundedFrom = from.kind === 'package' && from.parsed?.kind === 'bounded'
  const isBoundedTo = to.kind === 'package' && to.parsed?.kind === 'bounded'

  const fromContext = from.kind === 'package' ? (from.parsed?.context ?? null) : null
  const toContext = to.kind === 'package' ? (to.parsed?.context ?? null) : null

  if (isBoundedFrom && isBoundedTo && fromContext && toContext && fromContext !== toContext) {
    const allowedCross = rule.crossContextAllowedTo.has(toKey)
    if (!allowedCross) {
      return {
        ok: false,
        reason: 'cross-context source imports are forbidden (only workflows may import other domains)',
      }
    }
  }

  return { ok: true }
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce Platformik package boundary dependency graph.',
      recommended: true,
    },
    schema: [
      {
        type: 'object',
        properties: {
          matrix: { type: 'object' },
        },
        required: ['matrix'],
        additionalProperties: false,
      },
    ],
    messages: {
      forbidden: '{{from}} must not import {{to}}: {{reason}} (see docs/architecture/boundaries.md).',
      unknownInternal:
        '{{from}} imports internal package {{to}}, but its name cannot be classified by naming rules (see docs/architecture/naming.md).',
      crossPackageRelative: '{{from}} uses a cross-package relative import ({{to}}). Use @platformik/<dir> instead.',
      misconfigured: 'dependency-graph is misconfigured: {{reason}}.',
    },
  },
  create(context) {
    const filename = typeof context.getFilename === 'function' ? context.getFilename() : context.filename
    if (!filename || filename === '<input>' || filename === '<text>') return {}

    const fromProject = getProjectInfo(filename)
    if (!fromProject) return {}

    const workspaceRoot = findWorkspaceRootFromFilename(filename)

    const [options] = context.options
    const rawMatrix = options?.matrix
    const normalizedMatrixResult = normalizeMatrix(rawMatrix)
    const matrix = normalizedMatrixResult.ok ? normalizedMatrixResult.matrix : null

    function reportForbidden(node, toDisplay, reason) {
      const fromDisplay = fromProject.kind === 'app' ? `apps/${fromProject.dir}` : `packages/${fromProject.dir}`
      context.report({
        node,
        messageId: 'forbidden',
        data: { from: fromDisplay, to: toDisplay, reason },
      })
    }

    function checkInternalImport(node, specifier) {
      const parsedImport = parseInternalPackageImport(specifier)
      if (!parsedImport) return

      if (!matrix) return

      const toProject = {
        kind: 'package',
        dir: parsedImport.dir,
        parsed: parsePackageDir(parsedImport.dir),
      }

      if (!toProject.parsed) {
        const fromDisplay = fromProject.kind === 'app' ? `apps/${fromProject.dir}` : `packages/${fromProject.dir}`
        context.report({
          node,
          messageId: 'unknownInternal',
          data: { from: fromDisplay, to: `@platformik/${parsedImport.dir}` },
        })

        return
      }

      const result = validateEdge({ from: fromProject, to: toProject, matrix })
      if (!result.ok) reportForbidden(node, `@platformik/${parsedImport.dir}`, result.reason)
    }

    function checkRelativeImport(node, specifier) {
      if (!workspaceRoot) return

      const fromRoot = fromProject.rootDir
      const resolved = normalizePath(path.resolve(path.dirname(filename), specifier))

      if (resolved === fromRoot || resolved.startsWith(fromRoot + '/')) return

      const packagesPrefix = workspaceRoot + '/packages/'
      const appsPrefix = workspaceRoot + '/apps/'

      const crossesIntoWorkspace = resolved.startsWith(packagesPrefix) || resolved.startsWith(appsPrefix)
      if (!crossesIntoWorkspace) return

      context.report({
        node,
        messageId: 'crossPackageRelative',
        data: {
          from: fromProject.kind === 'app' ? `apps/${fromProject.dir}` : `packages/${fromProject.dir}`,
          to: specifier,
        },
      })
    }

    function handleSpecifier(node, specifier) {
      if (typeof specifier !== 'string' || specifier.length === 0) return

      if (specifier.startsWith('.')) {
        checkRelativeImport(node, specifier)

        return
      }

      if (specifier.startsWith(INTERNAL_SCOPE_PREFIX)) {
        checkInternalImport(node, specifier)
      }
    }

    return {
      Program(node) {
        if (matrix) return
        context.report({
          node,
          messageId: 'misconfigured',
          data: { reason: normalizedMatrixResult.reason },
        })
      },
      ImportDeclaration(node) {
        if (!matrix) return
        handleSpecifier(node, extractStaticImportSource(node.source))
      },
      ExportNamedDeclaration(node) {
        if (!matrix) return
        handleSpecifier(node, extractStaticImportSource(node.source))
      },
      ExportAllDeclaration(node) {
        if (!matrix) return
        handleSpecifier(node, extractStaticImportSource(node.source))
      },
      CallExpression(node) {
        if (!matrix) return
        if (node.callee?.type !== 'Identifier' || node.callee.name !== 'require') return
        const firstArg = node.arguments?.[0]
        handleSpecifier(node, extractStaticImportSource(firstArg))
      },
      ImportExpression(node) {
        if (!matrix) return
        handleSpecifier(node, extractStaticImportSource(node.source))
      },
    }
  },
}
