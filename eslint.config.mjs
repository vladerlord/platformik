import base from './tooling/eslint/base.config.mjs'
import tsBoundaries from './tooling/eslint/typescript.boundaries.config.mjs'

export default [...base, tsBoundaries]
