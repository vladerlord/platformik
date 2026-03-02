import { expect, test } from 'bun:test'
import { ESLint } from 'eslint'
import tsParser from '@typescript-eslint/parser'

import plugin from '../index.js'
import matrix from '../../typescript.boundaries.matrix.mjs'

async function lint({ filename, code, withMatrix = true }) {
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
          'platformik/dependency-graph': withMatrix ? ['error', { matrix }] : 'error',
        },
      },
    ],
  })

  const [result] = await eslint.lintText(code, { filePath: filename })

  return result.messages
}

test('reports misconfiguration when matrix missing', async () => {
  const results = await lint({
    filename: '/repo/apps/web-platform-ts/src/main.tsx',
    code: 'import "@platformik/ts-billing-workflows";',
    withMatrix: false,
  })
  expect(results).toHaveLength(1)
  expect(results[0].ruleId).toBe('platformik/dependency-graph')
  expect(results[0].message).toContain('misconfigured')
})

test('valid imports', async () => {
  expect(
    await lint({
      filename: '/repo/packages/ts-lib-logger/src/index.ts',
      code: 'import "@platformik/ts-lib-strings";',
    }),
  ).toHaveLength(0)

  expect(
    await lint({
      filename: '/repo/packages/ts-billing-domain/src/index.ts',
      code: 'import "@platformik/ts-lib-logger";',
    }),
  ).toHaveLength(0)

  expect(
    await lint({
      filename: '/repo/packages/ts-billing-workflows/src/index.ts',
      code: 'import "@platformik/ts-org-domain";',
    }),
  ).toHaveLength(0)

  expect(
    await lint({
      filename: '/repo/packages/ts-billing-workflows/src/index.ts',
      code: 'import "@platformik/ts-platform-openai";',
    }),
  ).toHaveLength(0)

  expect(
    await lint({
      filename: '/repo/packages/ts-billing-workflows/src/index.ts',
      code: 'import "@platformik/ts-infra-postgres";',
    }),
  ).toHaveLength(0)

  expect(
    await lint({
      filename: '/repo/apps/web-platform-ts/src/main.tsx',
      code: 'import "@platformik/ts-billing-workflows";',
    }),
  ).toHaveLength(0)

  expect(
    await lint({
      filename: 'C:/repo/packages/ts-lib-logger/src/index.ts',
      code: 'import "@platformik/ts-lib-strings";',
    }),
  ).toHaveLength(0)

  expect(
    await lint({
      filename: '/repo/packages/ts-billing-domain/src/index.ts',
      code: 'import "../..";',
    }),
  ).toHaveLength(0)
})

test('invalid imports', async () => {
  const unknown = await lint({
    filename: '/repo/apps/web-platform-ts/src/main.tsx',
    code: 'import "@platformik/ts-billing";',
  })
  expect(unknown).toHaveLength(1)
  expect(unknown[0].ruleId).toBe('platformik/dependency-graph')
  expect(unknown[0].message).toContain('cannot be classified')

  const appToDomain = await lint({
    filename: '/repo/apps/web-platform-ts/src/main.tsx',
    code: 'import "@platformik/ts-billing-domain";',
  })
  expect(appToDomain).toHaveLength(1)
  expect(appToDomain[0].message).toContain('must not import')

  const domainCrossContext = await lint({
    filename: '/repo/packages/ts-billing-domain/src/index.ts',
    code: 'import "@platformik/ts-org-domain";',
  })
  expect(domainCrossContext).toHaveLength(1)
  expect(domainCrossContext[0].message).toContain('must not import')

  const workflowsToAdapters = await lint({
    filename: '/repo/packages/ts-billing-workflows/src/index.ts',
    code: 'import "@platformik/ts-billing-infra";',
  })
  expect(workflowsToAdapters).toHaveLength(1)
  expect(workflowsToAdapters[0].message).toContain('must not import')

  const infraToPlatform = await lint({
    filename: '/repo/packages/ts-billing-infra/src/index.ts',
    code: 'import "@platformik/ts-platform-openai";',
  })
  expect(infraToPlatform).toHaveLength(1)
  expect(infraToPlatform[0].message).toContain('must not import')

  const migrationsToDomain = await lint({
    filename: '/repo/packages/ts-billing-migrations/src/index.ts',
    code: 'import "@platformik/ts-billing-domain";',
  })
  expect(migrationsToDomain).toHaveLength(1)
  expect(migrationsToDomain[0].message).toContain('must not import')

  const crossLang = await lint({
    filename: '/repo/apps/web-platform-ts/src/main.tsx',
    code: 'import "@platformik/py-billing-domain";',
  })
  expect(crossLang).toHaveLength(1)
  expect(crossLang[0].message).toContain('cross-language')

  const crossPkgRel = await lint({
    filename: '/repo/apps/web-platform-ts/src/main.tsx',
    code: 'import "../../../packages/ts-billing-domain/src/index";',
  })
  expect(crossPkgRel).toHaveLength(1)
  expect(crossPkgRel[0].message).toContain('cross-package relative import')
})
