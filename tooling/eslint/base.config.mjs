import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig } from 'eslint/config'
import moduleBoundaries from './plugin-module-boundaries.js'

export default defineConfig(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/.moon/**', '**/bun.lockb', 'tooling/eslint/plugin-module-boundaries.js'],
  },
  {
    languageOptions: {
      globals: globals.node,
    },
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    plugins: {
      'module-boundaries': moduleBoundaries,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      'newline-before-return': 'error',
      'module-boundaries/no-internal-imports': [
        'error',
        {
          monorepoScope: '@platformik',
          allowedSubpaths: ['contracts'],
        },
      ],
      'module-boundaries/no-cross-package-relative': 'error',
    },
  },
)
