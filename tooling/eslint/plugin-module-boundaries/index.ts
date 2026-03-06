import noInternalImports from './rules/no-internal-imports.ts'
import noCrossPackageRelative from './rules/no-cross-package-relative.ts'

export default {
  rules: {
    'no-internal-imports': noInternalImports,
    'no-cross-package-relative': noCrossPackageRelative,
  },
}
