import noInternalImports from './rules/no-internal-imports.ts'
import noCrossPackageRelative from './rules/no-cross-package-relative.ts'
import enforceModuleExports from './rules/enforce-module-exports.ts'

export default {
  rules: {
    'enforce-module-exports': enforceModuleExports,
    'no-internal-imports': noInternalImports,
    'no-cross-package-relative': noCrossPackageRelative,
  },
}
