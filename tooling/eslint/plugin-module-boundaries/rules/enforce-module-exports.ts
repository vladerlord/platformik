import type { Rule } from 'eslint'

const REQUIRED_EXPORT_KEYS = ['.', './contracts']
const OPTIONAL_EXPORT_KEYS = ['./migrations']
const ALLOWED_EXPORT_KEYS = new Set([...REQUIRED_EXPORT_KEYS, ...OPTIONAL_EXPORT_KEYS])
const PUBLIC_TARGET_PREFIX = './src/public/'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function collectStringTargets(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value]
  }

  if (!isRecord(value)) {
    return []
  }

  return Object.values(value).flatMap((entry) => collectStringTargets(entry))
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [],
  },
  create(context) {
    const filename = context.filename
    const sourceCode = context.sourceCode

    return {
      Program(node) {
        if (!filename.includes('/packages/module-') || !filename.endsWith('/package.json')) {
          return
        }

        const manifest = JSON.parse(sourceCode.text) as Record<string, unknown>
        const exportsField = manifest.exports

        if (!isRecord(exportsField)) {
          context.report({
            node,
            message:
              'Module packages must define package.json "exports" as an object with ".", "./contracts", and optional "./migrations" entry points.',
          })

          return
        }

        for (const requiredExportKey of REQUIRED_EXPORT_KEYS) {
          if (!(requiredExportKey in exportsField)) {
            context.report({
              node,
              message: `Module packages must define the "${requiredExportKey}" export in package.json.`,
            })
          }
        }

        for (const exportKey of Object.keys(exportsField)) {
          if (!ALLOWED_EXPORT_KEYS.has(exportKey)) {
            context.report({
              node,
              message: `Module packages may expose only ".", "./contracts", and optional "./migrations". Found "${exportKey}".`,
            })
            continue
          }

          const targets = collectStringTargets(exportsField[exportKey])

          if (targets.length === 0) {
            context.report({
              node,
              message: `Export "${exportKey}" must resolve to a file inside "${PUBLIC_TARGET_PREFIX}".`,
            })
            continue
          }

          for (const target of targets) {
            if (!target.startsWith(PUBLIC_TARGET_PREFIX)) {
              context.report({
                node,
                message: `Export "${exportKey}" must resolve only to files inside "${PUBLIC_TARGET_PREFIX}". Found "${target}".`,
              })
            }
          }
        }
      },
    }
  },
}

export default rule
