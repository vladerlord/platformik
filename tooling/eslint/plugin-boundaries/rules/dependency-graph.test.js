import { expect, test } from 'bun:test'
import { ESLint } from 'eslint'
import tsParser from '@typescript-eslint/parser'

import plugin from '../index.js'
import matrix from '../../typescript.boundaries.matrix.mjs'

async function lint({ filename, code, withMatrix = true, matrixOverride }) {
  const eslint = new ESLint({
    cwd: '/',
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.{js,mjs,cjs,ts,tsx,jsx}'],
        languageOptions: {
          parser: tsParser,
          parserOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            ecmaFeatures: { jsx: true },
          },
        },
        plugins: {
          platformik: {
            rules: {
              'dependency-graph': plugin.rules['dependency-graph'],
            },
          },
        },
        rules: {
          'platformik/dependency-graph': withMatrix
            ? ['error', { matrix: matrixOverride ?? matrix }]
            : 'error',
        },
      },
    ],
  })

  const [result] = await eslint.lintText(code, { filePath: filename })
  return result.messages
}

test('reports misconfiguration when matrix missing', async () => {
  const results = await lint({
    filename: '/repo/apps/app-web-platform-ts/src/main.tsx',
    code: 'import "@platformik/billing-workflows-ts";',
    withMatrix: false,
  })

  expect(results).toHaveLength(1)
  expect(results[0].message).toContain('misconfigured')
})

test('reports misconfiguration when matrix key is invalid', async () => {
  const badMatrix = {
    ...matrix,
    app: {
      allow: ['shared', 'not-a-key'],
    },
  }

  const results = await lint({
    filename: '/repo/apps/app-web-platform-ts/src/main.tsx',
    code: 'import "@platformik/billing-workflows-ts";',
    matrixOverride: badMatrix,
  })

  expect(results).toHaveLength(1)
  expect(results[0].message).toContain('misconfigured')
})

test('valid dependency flow', async () => {
  expect(
    await lint({
      filename: '/repo/apps/app-web-platform-ts/src/main.tsx',
      code: 'import "@platformik/billing-workflows-ts";',
    }),
  ).toHaveLength(0)

  expect(
    await lint({
      filename: '/repo/apps/bff-web-platform-py/src/main.ts',
      code: 'import "@platformik/openai-provider-py";',
    }),
  ).toHaveLength(0)

  expect(
    await lint({
      filename: '/repo/packages/billing-domain-ts/src/index.ts',
      code: 'import "@platformik/shared-fp-domain-ts";',
    }),
  ).toHaveLength(0)

  expect(
    await lint({
      filename: '/repo/packages/billing-workflows-ts/src/index.ts',
      code: 'import "@platformik/billing-domain-ts";',
    }),
  ).toHaveLength(0)

  expect(
    await lint({
      filename: '/repo/packages/billing-workflows-ts/src/index.ts',
      code: 'import "@platformik/shared-runtime-platform-ts";',
    }),
  ).toHaveLength(0)

  expect(
    await lint({
      filename: '/repo/packages/billing-infra-ts/src/index.ts',
      code: 'import "@platformik/openai-provider-ts";',
    }),
  ).toHaveLength(0)

  expect(
    await lint({
      filename: '/repo/packages/billing-migrations-ts/src/index.ts',
      code: 'import "@platformik/shared-runtime-platform-ts";',
    }),
  ).toHaveLength(0)

  expect(
    await lint({
      filename: '/repo/packages/shared-fp-domain-ts/src/index.ts',
      code: 'import "@platformik/shared-runtime-domain-ts";',
    }),
  ).toHaveLength(0)
})

test('invalid dependency flow', async () => {
  const appToDomain = await lint({
    filename: '/repo/apps/app-web-platform-ts/src/main.tsx',
    code: 'import "@platformik/billing-domain-ts";',
  })
  expect(appToDomain).toHaveLength(1)
  expect(appToDomain[0].message).toContain('must not import')

  const domainToInfra = await lint({
    filename: '/repo/packages/billing-domain-ts/src/index.ts',
    code: 'import "@platformik/billing-infra-ts";',
  })
  expect(domainToInfra).toHaveLength(1)
  expect(domainToInfra[0].message).toContain('must not import')

  const providerToPlatform = await lint({
    filename: '/repo/packages/openai-provider-ts/src/index.ts',
    code: 'import "@platformik/runtime-platform-ts";',
  })
  expect(providerToPlatform).toHaveLength(1)
  expect(providerToPlatform[0].message).toContain('must not import')

  const platformToProvider = await lint({
    filename: '/repo/packages/runtime-platform-ts/src/index.ts',
    code: 'import "@platformik/openai-provider-ts";',
  })
  expect(platformToProvider).toHaveLength(1)
  expect(platformToProvider[0].message).toContain('must not import')

  const migrationsToDomain = await lint({
    filename: '/repo/packages/billing-migrations-ts/src/index.ts',
    code: 'import "@platformik/billing-domain-ts";',
  })
  expect(migrationsToDomain).toHaveLength(1)
  expect(migrationsToDomain[0].message).toContain('must not import')
})

test('reports unknown source and unknown internal names', async () => {
  const badSource = await lint({
    filename: '/repo/apps/worker-orchestration-py/src/index.ts',
    code: 'import "@platformik/billing-workflows-py";',
  })
  expect(badSource).toHaveLength(1)
  expect(badSource[0].message).toContain('cannot be classified')

  const badInternal = await lint({
    filename: '/repo/apps/app-web-platform-ts/src/main.tsx',
    code: 'import "@platformik/ts-billing-workflows";',
  })
  expect(badInternal).toHaveLength(1)
  expect(badInternal[0].message).toContain('cannot be classified')
})

test('forbids cross-language imports', async () => {
  const crossLanguage = await lint({
    filename: '/repo/apps/app-web-platform-ts/src/main.tsx',
    code: 'import "@platformik/billing-domain-py";',
  })

  expect(crossLanguage).toHaveLength(1)
  expect(crossLanguage[0].message).toContain('cross-language')
})

test('forbids cross-package relative imports', async () => {
  const result = await lint({
    filename: '/repo/apps/app-web-platform-ts/src/main.tsx',
    code: 'import "../../../packages/billing-domain-ts/src/index";',
  })

  expect(result).toHaveLength(1)
  expect(result[0].message).toContain('cross-package relative import')
})

test('supports require and import() static specifiers', async () => {
  const requireResult = await lint({
    filename: '/repo/packages/billing-workflows-ts/src/index.ts',
    code: 'require("@platformik/billing-domain-ts");',
  })
  expect(requireResult).toHaveLength(0)

  const importExpressionResult = await lint({
    filename: '/repo/packages/billing-workflows-ts/src/index.ts',
    code: 'await import("@platformik/billing-domain-ts");',
  })
  expect(importExpressionResult).toHaveLength(0)
})
