import type { Rule } from 'eslint'
import path from 'node:path'
import { existsSync } from 'node:fs'

function findPackageRoot(filePath: string): string | null {
  let dir = path.dirname(filePath)
  while (dir !== path.parse(dir).root) {
    if (existsSync(path.join(dir, 'package.json'))) {
      return dir
    }
    dir = path.dirname(dir)
  }

  return null
}

function isOutsidePackage(importSource: string, filePath: string, packageRoot: string): boolean {
  const fileDir = path.dirname(filePath)
  const resolved = path.resolve(fileDir, importSource)

  return !resolved.startsWith(packageRoot + path.sep) && resolved !== packageRoot
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [],
  },
  create(context) {
    const filename: string = context.filename

    function check(source: string, node: Rule.Node): void {
      if (!source.startsWith('./') && !source.startsWith('../')) return
      if (!filename || filename === '<input>') return

      const packageRoot = findPackageRoot(filename)
      if (!packageRoot) return

      if (isOutsidePackage(source, filename, packageRoot)) {
        context.report({
          node,
          message: `Relative import "${source}" escapes the package boundary. Use a package dependency instead (e.g. "@platformik/module-name/contracts").`,
        })
      }
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
