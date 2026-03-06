import type { Rule } from 'eslint'

interface Options {
  monorepoScope: string
  allowedSubpaths: string[]
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: {
          monorepoScope: { type: 'string' },
          allowedSubpaths: { type: 'array', items: { type: 'string' } },
        },
        required: ['monorepoScope'],
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const opts = context.options[0] as Options | undefined
    const monorepoScope = opts?.monorepoScope ?? '@platformik'
    const allowedSubpaths = opts?.allowedSubpaths ?? ['contracts']
    const modulePrefix = `${monorepoScope}/module-`

    const filename: string = context.filename

    function check(source: string, node: Rule.Node): void {
      if (!source.startsWith(modulePrefix)) return

      // source: "@platformik/module-iam-ts" or "@platformik/module-iam-ts/contracts"
      const afterScope = source.slice(monorepoScope.length + 1) // "module-iam-ts" or "module-iam-ts/contracts"
      const slashIdx = afterScope.indexOf('/')

      if (slashIdx === -1) return // bare package name — valid

      const pkgDir = afterScope.slice(0, slashIdx) // "module-iam-ts"
      const pkgName = `${monorepoScope}/${pkgDir}` // "@platformik/module-iam-ts"
      const subpath = afterScope.slice(slashIdx + 1) // "src/domain/user" or "contracts"

      // Self-import exemption: importing file is inside the same module package
      if (filename.includes(`/${pkgDir}/`) || filename.includes(`\\${pkgDir}\\`)) return

      if (allowedSubpaths.includes(subpath)) return

      context.report({
        node,
        message: `Importing internal path "${source}" is not allowed. Use "${pkgName}" or "${pkgName}/contracts" instead.`,
      })
    }

    return {
      ImportDeclaration(node) {
        check(node.source.value as string, node as unknown as Rule.Node)
      },
      ImportExpression(node) {
        if (node.source.type === 'Literal') {
          check((node.source as { value: string }).value, node as unknown as Rule.Node)
        }
      },
    }
  },
}

export default rule
