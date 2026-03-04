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
          'platformik/dependency-graph': withMatrix ? ['error', { matrix: matrixOverride ?? matrix }] : 'error',
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
    code: 'import "@platformik/module-billing-ts";',
    withMatrix: false,
  })

  expect(results).toHaveLength(1)
  expect(results[0].message).toContain('misconfigured')
})

test('reports misconfiguration when matrix key is invalid', async () => {
  const badMatrix = {
    ...matrix,
    app: {
      allow: ['lib', 'not-a-key'],
    },
  }

  const results = await lint({
    filename: '/repo/apps/app-web-platform-ts/src/main.tsx',
    code: 'import "@platformik/module-billing-ts";',
    matrixOverride: badMatrix,
  })

  expect(results).toHaveLength(1)
  expect(results[0].message).toContain('misconfigured')
})

test('valid dependency flow', async () => {
  // app → module
  expect(
    await lint({
      filename: '/repo/apps/app-web-platform-ts/src/main.tsx',
      code: 'import "@platformik/module-billing-ts";',
    }),
  ).toHaveLength(0)

  // app → adapter (same language)
  expect(
    await lint({
      filename: '/repo/apps/app-web-platform-ts/src/main.tsx',
      code: 'import "@platformik/adapter-billing-ts";',
    }),
  ).toHaveLength(0)

  // domain → lib
  expect(
    await lint({
      filename: '/repo/packages/domain-billing-ts/src/index.ts',
      code: 'import "@platformik/lib-fp-ts";',
    }),
  ).toHaveLength(0)

  // ports → domain
  expect(
    await lint({
      filename: '/repo/packages/ports-billing-ts/src/index.ts',
      code: 'import "@platformik/domain-billing-ts";',
    }),
  ).toHaveLength(0)

  // ports → lib
  expect(
    await lint({
      filename: '/repo/packages/ports-billing-ts/src/index.ts',
      code: 'import "@platformik/lib-fp-ts";',
    }),
  ).toHaveLength(0)

  // module → domain
  expect(
    await lint({
      filename: '/repo/packages/module-billing-ts/src/index.ts',
      code: 'import "@platformik/domain-billing-ts";',
    }),
  ).toHaveLength(0)

  // module → ports
  expect(
    await lint({
      filename: '/repo/packages/module-billing-ts/src/index.ts',
      code: 'import "@platformik/ports-billing-ts";',
    }),
  ).toHaveLength(0)

  // module → contracts
  expect(
    await lint({
      filename: '/repo/packages/module-billing-ts/src/index.ts',
      code: 'import "@platformik/contracts-billing-ts";',
    }),
  ).toHaveLength(0)

  // module → lib
  expect(
    await lint({
      filename: '/repo/packages/module-billing-ts/src/index.ts',
      code: 'import "@platformik/lib-fp-ts";',
    }),
  ).toHaveLength(0)

  // workflows → ports (cross-context: pipeline importing billing ports)
  expect(
    await lint({
      filename: '/repo/packages/workflows-pipeline-ts/src/index.ts',
      code: 'import "@platformik/ports-billing-ts";',
    }),
  ).toHaveLength(0)

  // workflows → contracts
  expect(
    await lint({
      filename: '/repo/packages/workflows-pipeline-ts/src/index.ts',
      code: 'import "@platformik/contracts-billing-ts";',
    }),
  ).toHaveLength(0)

  // workflows → runtime (orchestration engine)
  expect(
    await lint({
      filename: '/repo/packages/workflows-checkout-ts/src/index.ts',
      code: 'import "@platformik/runtime-temporal-ts";',
    }),
  ).toHaveLength(0)

  // adapter → domain
  expect(
    await lint({
      filename: '/repo/packages/adapter-billing-ts/src/index.ts',
      code: 'import "@platformik/domain-billing-ts";',
    }),
  ).toHaveLength(0)

  // adapter → ports
  expect(
    await lint({
      filename: '/repo/packages/adapter-billing-ts/src/index.ts',
      code: 'import "@platformik/ports-billing-ts";',
    }),
  ).toHaveLength(0)

  // adapter → runtime
  expect(
    await lint({
      filename: '/repo/packages/adapter-billing-ts/src/index.ts',
      code: 'import "@platformik/runtime-postgres-ts";',
    }),
  ).toHaveLength(0)

  // adapter → vendor
  expect(
    await lint({
      filename: '/repo/packages/adapter-billing-ts/src/index.ts',
      code: 'import "@platformik/vendor-openai-ts";',
    }),
  ).toHaveLength(0)

  // lib → lib
  expect(
    await lint({
      filename: '/repo/packages/lib-fp-ts/src/index.ts',
      code: 'import "@platformik/lib-retries-ts";',
    }),
  ).toHaveLength(0)

  // migrations → runtime
  expect(
    await lint({
      filename: '/repo/packages/migrations-billing-ts/src/index.ts',
      code: 'import "@platformik/runtime-postgres-ts";',
    }),
  ).toHaveLength(0)
})

test('invalid dependency flow', async () => {
  // lib → domain (blocked)
  const libToDomain = await lint({
    filename: '/repo/packages/lib-fp-ts/src/index.ts',
    code: 'import "@platformik/domain-billing-ts";',
  })
  expect(libToDomain).toHaveLength(1)
  expect(libToDomain[0].message).toContain('must not import')

  // domain → ports (blocked)
  const domainToPorts = await lint({
    filename: '/repo/packages/domain-billing-ts/src/index.ts',
    code: 'import "@platformik/ports-billing-ts";',
  })
  expect(domainToPorts).toHaveLength(1)
  expect(domainToPorts[0].message).toContain('must not import')

  // domain → adapter (blocked)
  const domainToAdapter = await lint({
    filename: '/repo/packages/domain-billing-ts/src/index.ts',
    code: 'import "@platformik/adapter-billing-ts";',
  })
  expect(domainToAdapter).toHaveLength(1)
  expect(domainToAdapter[0].message).toContain('must not import')

  // ports → module (blocked)
  const portsToModule = await lint({
    filename: '/repo/packages/ports-billing-ts/src/index.ts',
    code: 'import "@platformik/module-billing-ts";',
  })
  expect(portsToModule).toHaveLength(1)
  expect(portsToModule[0].message).toContain('must not import')

  // ports → adapter (blocked)
  const portsToAdapter = await lint({
    filename: '/repo/packages/ports-billing-ts/src/index.ts',
    code: 'import "@platformik/adapter-billing-ts";',
  })
  expect(portsToAdapter).toHaveLength(1)
  expect(portsToAdapter[0].message).toContain('must not import')

  // module → adapter (blocked)
  const moduleToAdapter = await lint({
    filename: '/repo/packages/module-billing-ts/src/index.ts',
    code: 'import "@platformik/adapter-billing-ts";',
  })
  expect(moduleToAdapter).toHaveLength(1)
  expect(moduleToAdapter[0].message).toContain('must not import')

  // module → runtime (blocked — use factory injection)
  const moduleToRuntime = await lint({
    filename: '/repo/packages/module-billing-ts/src/index.ts',
    code: 'import "@platformik/runtime-postgres-ts";',
  })
  expect(moduleToRuntime).toHaveLength(1)
  expect(moduleToRuntime[0].message).toContain('must not import')

  // module → vendor (blocked)
  const moduleToVendor = await lint({
    filename: '/repo/packages/module-billing-ts/src/index.ts',
    code: 'import "@platformik/vendor-openai-ts";',
  })
  expect(moduleToVendor).toHaveLength(1)
  expect(moduleToVendor[0].message).toContain('must not import')

  // module → module (blocked — cross-context)
  const moduleToModule = await lint({
    filename: '/repo/packages/module-billing-ts/src/index.ts',
    code: 'import "@platformik/module-templates-ts";',
  })
  expect(moduleToModule).toHaveLength(1)
  expect(moduleToModule[0].message).toContain('must not import')

  // workflows → module (blocked)
  const workflowsToModule = await lint({
    filename: '/repo/packages/workflows-pipeline-ts/src/index.ts',
    code: 'import "@platformik/module-billing-ts";',
  })
  expect(workflowsToModule).toHaveLength(1)
  expect(workflowsToModule[0].message).toContain('must not import')

  // workflows → adapter (blocked)
  const workflowsToAdapter = await lint({
    filename: '/repo/packages/workflows-pipeline-ts/src/index.ts',
    code: 'import "@platformik/adapter-billing-ts";',
  })
  expect(workflowsToAdapter).toHaveLength(1)
  expect(workflowsToAdapter[0].message).toContain('must not import')

  // workflows → vendor (blocked)
  const workflowsToVendor = await lint({
    filename: '/repo/packages/workflows-pipeline-ts/src/index.ts',
    code: 'import "@platformik/vendor-openai-ts";',
  })
  expect(workflowsToVendor).toHaveLength(1)
  expect(workflowsToVendor[0].message).toContain('must not import')

  // workflows → domain (blocked — use ports interfaces instead)
  const workflowsToDomain = await lint({
    filename: '/repo/packages/workflows-pipeline-ts/src/index.ts',
    code: 'import "@platformik/domain-billing-ts";',
  })
  expect(workflowsToDomain).toHaveLength(1)
  expect(workflowsToDomain[0].message).toContain('must not import')

  // adapter → module (blocked)
  const adapterToModule = await lint({
    filename: '/repo/packages/adapter-billing-ts/src/index.ts',
    code: 'import "@platformik/module-billing-ts";',
  })
  expect(adapterToModule).toHaveLength(1)
  expect(adapterToModule[0].message).toContain('must not import')

  // adapter → adapter (blocked — cross-context)
  const adapterToAdapter = await lint({
    filename: '/repo/packages/adapter-billing-ts/src/index.ts',
    code: 'import "@platformik/adapter-templates-ts";',
  })
  expect(adapterToAdapter).toHaveLength(1)
  expect(adapterToAdapter[0].message).toContain('must not import')

  // runtime → vendor (blocked)
  const runtimeToVendor = await lint({
    filename: '/repo/packages/runtime-postgres-ts/src/index.ts',
    code: 'import "@platformik/vendor-openai-ts";',
  })
  expect(runtimeToVendor).toHaveLength(1)
  expect(runtimeToVendor[0].message).toContain('must not import')

  // vendor → runtime (blocked)
  const vendorToRuntime = await lint({
    filename: '/repo/packages/vendor-openai-ts/src/index.ts',
    code: 'import "@platformik/runtime-postgres-ts";',
  })
  expect(vendorToRuntime).toHaveLength(1)
  expect(vendorToRuntime[0].message).toContain('must not import')

  // migrations → domain (blocked — independent of domain code)
  const migrationsToDomain = await lint({
    filename: '/repo/packages/migrations-billing-ts/src/index.ts',
    code: 'import "@platformik/domain-billing-ts";',
  })
  expect(migrationsToDomain).toHaveLength(1)
  expect(migrationsToDomain[0].message).toContain('must not import')
})

test('reports unknown source and unknown internal names', async () => {
  // app dir missing client token — cannot be classified
  const badSource = await lint({
    filename: '/repo/apps/worker-runtime-orchestration-py/src/index.ts',
    code: 'import "@platformik/module-billing-ts";',
  })
  expect(badSource).toHaveLength(1)
  expect(badSource[0].message).toContain('cannot be classified')

  // old-format package name (context-first) cannot be classified
  const badInternal = await lint({
    filename: '/repo/apps/app-web-platform-ts/src/main.tsx',
    code: 'import "@platformik/billing-domain-ts";',
  })
  expect(badInternal).toHaveLength(1)
  expect(badInternal[0].message).toContain('cannot be classified')
})

test('forbids cross-language imports', async () => {
  const crossLanguage = await lint({
    filename: '/repo/apps/app-web-platform-ts/src/main.tsx',
    code: 'import "@platformik/domain-billing-py";',
  })

  expect(crossLanguage).toHaveLength(1)
  expect(crossLanguage[0].message).toContain('cross-language')
})

test('forbids cross-package relative imports', async () => {
  const result = await lint({
    filename: '/repo/apps/app-web-platform-ts/src/main.tsx',
    code: 'import "../../../packages/domain-billing-ts/src/index";',
  })

  expect(result).toHaveLength(1)
  expect(result[0].message).toContain('cross-package relative import')
})

test('supports require and import() static specifiers', async () => {
  const requireResult = await lint({
    filename: '/repo/packages/module-billing-ts/src/index.ts',
    code: 'require("@platformik/domain-billing-ts");',
  })
  expect(requireResult).toHaveLength(0)

  const importExpressionResult = await lint({
    filename: '/repo/packages/module-billing-ts/src/index.ts',
    code: 'await import("@platformik/domain-billing-ts");',
  })
  expect(importExpressionResult).toHaveLength(0)
})
