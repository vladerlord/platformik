import path from 'node:path'

import { getProjectInfo, parseInternalPackageImport, parsePackageDir } from '../core/classify.js'
import { INTERNAL_SCOPE_PREFIX } from '../core/constants.js'
import { normalizeMatrix } from '../core/matrix.js'
import { findWorkspaceRootFromFilename, normalizePath } from '../core/path-utils.js'
import { extractStaticImportSource } from '../core/specifier.js'
import { validateEdge } from '../core/validate-edge.js'

function toProjectDisplay(project) {
  return project.kind === 'app' ? `apps/${project.dir}` : `packages/${project.dir}`
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
        '{{from}} imports internal package {{to}}, but its name cannot be classified by boundaries naming rules (see docs/architecture/boundaries.md).',
      unknownSource: '{{from}} cannot be classified by boundaries naming rules (see docs/architecture/boundaries.md).',
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
    const normalizedMatrixResult = normalizeMatrix(options?.matrix)
    const matrix = normalizedMatrixResult.ok ? normalizedMatrixResult.matrix : null

    function reportForbidden(node, toDisplay, reason) {
      context.report({
        node,
        messageId: 'forbidden',
        data: {
          from: toProjectDisplay(fromProject),
          to: toDisplay,
          reason,
        },
      })
    }

    function checkInternalImport(node, specifier) {
      const parsedImport = parseInternalPackageImport(specifier)
      if (!parsedImport) return

      const toProject = {
        kind: 'package',
        dir: parsedImport.dir,
        parsed: parsePackageDir(parsedImport.dir),
      }

      if (!toProject.parsed) {
        context.report({
          node,
          messageId: 'unknownInternal',
          data: {
            from: toProjectDisplay(fromProject),
            to: `@platformik/${parsedImport.dir}`,
          },
        })

        return
      }

      const result = validateEdge({ from: fromProject, to: toProject, matrix })
      if (!result.ok) {
        reportForbidden(node, `@platformik/${parsedImport.dir}`, result.reason)
      }
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
          from: toProjectDisplay(fromProject),
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
        if (!matrix) {
          context.report({
            node,
            messageId: 'misconfigured',
            data: { reason: normalizedMatrixResult.reason },
          })

          return
        }

        if (!fromProject.parsed) {
          context.report({
            node,
            messageId: 'unknownSource',
            data: { from: toProjectDisplay(fromProject) },
          })
        }
      },
      ImportDeclaration(node) {
        if (!matrix || !fromProject.parsed) return
        handleSpecifier(node, extractStaticImportSource(node.source))
      },
      ExportNamedDeclaration(node) {
        if (!matrix || !fromProject.parsed) return
        handleSpecifier(node, extractStaticImportSource(node.source))
      },
      ExportAllDeclaration(node) {
        if (!matrix || !fromProject.parsed) return
        handleSpecifier(node, extractStaticImportSource(node.source))
      },
      CallExpression(node) {
        if (!matrix || !fromProject.parsed) return
        if (node.callee?.type !== 'Identifier' || node.callee.name !== 'require') return
        handleSpecifier(node, extractStaticImportSource(node.arguments?.[0]))
      },
      ImportExpression(node) {
        if (!matrix || !fromProject.parsed) return
        handleSpecifier(node, extractStaticImportSource(node.source))
      },
    }
  },
}
