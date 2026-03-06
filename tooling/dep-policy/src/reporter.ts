import type { Violation } from './validator.ts'

export interface PackageViolations {
  pkgPath: string
  role: string
  mode: string
  violations: Violation[]
}

export function report(packages: PackageViolations[]): string {
  const violating = packages.filter((p) => p.violations.length > 0)

  if (violating.length === 0) {
    return 'All packages pass dependency policy checks.'
  }

  const lines: string[] = []
  let totalViolations = 0

  for (const pkg of violating) {
    const modeStr = pkg.mode !== 'allow_any' ? `, mode: ${pkg.mode}` : ''
    lines.push(`\u2717 ${pkg.pkgPath} (role: ${pkg.role}${modeStr})`)
    for (const v of pkg.violations) {
      lines.push(`    ${v.dependency} \u2014 ${v.reason}`)
      totalViolations++
    }
    lines.push('')
  }

  const pkgWord = violating.length === 1 ? 'package' : 'packages'
  const vWord = totalViolations === 1 ? 'violation' : 'violations'
  lines.push(`Found ${totalViolations} ${vWord} in ${violating.length} ${pkgWord}.`)

  return lines.join('\n')
}
