import tsParser from '@typescript-eslint/parser'

import boundaries from './plugin-boundaries/index.js'
import matrix from './typescript.boundaries.matrix.mjs'

export default {
  files: ['**/*.{ts,tsx}'],
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    parser: tsParser,
  },
  plugins: {
    'platformik-boundaries': boundaries,
  },
  rules: {
    'platformik-boundaries/dependency-graph': ['error', { matrix }],
  },
}
