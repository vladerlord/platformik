import { join } from 'path'
import { loadConfig } from './config.ts'
import { discoverPackages } from './discovery.ts'
import { typescriptParser } from './parsers/typescript.ts'
import { rustParser } from './parsers/rust.ts'
import { goParser } from './parsers/go.ts'
import { pythonParser } from './parsers/python.ts'
import type { ManifestParser } from './parsers/types.ts'
import { validate } from './validator.ts'
import { report, type PackageViolations } from './reporter.ts'

const PARSERS: Record<string, ManifestParser> = {
  ts: typescriptParser,
  rs: rustParser,
  go: goParser,
  py: pythonParser,
}

function parseArgs(args: string[]): { root: string; config: string } {
  let root = process.cwd()
  let config = ''

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root' && args[i + 1]) {
      root = args[++i]!
    } else if (args[i] === '--config' && args[i + 1]) {
      config = args[++i]!
    }
  }

  if (!config) {
    config = join(root, 'tooling/dep-policy/policy.yaml')
  }

  return { root, config }
}

function main(): void {
  const { root, config: configPath } = parseArgs(process.argv.slice(2))

  const policy = loadConfig(configPath)
  const packages = discoverPackages(root, policy)

  const results: PackageViolations[] = []

  for (const pkg of packages) {
    // Schema packages have no runtime deps — skip validation
    if (pkg.kind === 'schema') continue

    const rule = policy.rules[pkg.role]
    if (!rule) {
      process.stderr.write(`[dep-policy] no rule for role "${pkg.role}", skipping ${pkg.path}\n`)
      continue
    }

    const parser = PARSERS[pkg.suffix]
    if (!parser) continue

    const deps = parser.parse(pkg.path)
    const violations = validate(deps, rule, pkg.suffix, policy.monorepoScope, pkg.role)
    const relPath = pkg.path.startsWith(root + '/') ? pkg.path.slice(root.length + 1) : pkg.path

    results.push({ pkgPath: relPath, role: pkg.role, mode: rule.mode, violations })
  }

  console.log(report(results))
  process.exit(results.some((r) => r.violations.length > 0) ? 1 : 0)
}

main()
