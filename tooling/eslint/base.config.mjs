import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import svelte from 'eslint-plugin-svelte'
import { defineConfig } from 'eslint/config'
import moduleBoundaries from './plugin-module-boundaries.js'

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.svelte-kit/**',
      '**/.moon/**',
      '**/pnpm-lock.yaml',
      'tooling/eslint/plugin-module-boundaries.js',
    ],
  },
  {
    languageOptions: {
      globals: globals.node,
    },
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  svelte.configs['flat/recommended'],
  svelte.configs['flat/prettier'],
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: {
        // Pass the TypeScript parser so <script lang="ts"> is type-aware
        parser: tseslint.parser,
      },
    },
    rules: {
      // TypeScript handles undefined checks inside <script lang="ts"> — no-undef sees DOM
      // types (MouseEvent, etc.) as unknown globals, so we defer to tsc instead.
      'no-undef': 'off',
      // Only relevant when paths.base is configured in svelte.config.js; not needed here.
      'svelte/no-navigation-without-resolve': 'off',
      // Prettier enforces printWidth for code structure but cannot break string literals
      // (e.g. long Tailwind class= attributes). max-len catches those cases.
      'max-len': ['error', { code: 120, ignoreUrls: true, ignoreComments: true }],
    },
  },
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
          allowedSubpaths: ['contracts', 'migrations'],
        },
      ],
      'module-boundaries/no-cross-package-relative': 'error',
    },
  },
)
