import { expect, test } from 'vitest'
import { ESLint } from 'eslint'
import * as jsoncParser from 'jsonc-eslint-parser'

import rule from '../rules/enforce-module-exports.ts'

const MODULE_PACKAGE_JSON = '/repo/packages/module-iam/package.json'
const LIB_PACKAGE_JSON = '/repo/packages/lib-fp/package.json'

async function lint(code: string, filename = MODULE_PACKAGE_JSON) {
  const eslint = new ESLint({
    cwd: '/',
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/package.json'],
        languageOptions: {
          parser: jsoncParser,
        },
        plugins: {
          'module-boundaries': { rules: { 'enforce-module-exports': rule } },
        },
        rules: {
          'module-boundaries/enforce-module-exports': 'error',
        },
      },
    ],
  })

  const [result] = await eslint.lintText(code, { filePath: filename })

  return result.messages
}

test('allows module package exports that point only into src/public', async () => {
  const messages = await lint(`{
    "name": "@platformik/module-iam",
    "exports": {
      ".": "./src/public/module.ts",
      "./contracts": "./src/public/contracts/index.ts",
      "./migrations": "./src/public/migrations.ts"
    }
  }`)

  expect(messages).toHaveLength(0)
})

test('allows conditional exports when all targets stay inside src/public', async () => {
  const messages = await lint(`{
    "name": "@platformik/module-iam",
    "exports": {
      ".": {
        "types": "./src/public/module.ts",
        "default": "./src/public/module.ts"
      },
      "./contracts": {
        "types": "./src/public/contracts/index.ts",
        "default": "./src/public/contracts/index.ts"
      }
    }
  }`)

  expect(messages).toHaveLength(0)
})

test('ignores non-module package manifests', async () => {
  const messages = await lint(
    `{
      "name": "@platformik/lib-fp",
      "exports": {
        ".": "./src/index.ts"
      }
    }`,
    LIB_PACKAGE_JSON,
  )

  expect(messages).toHaveLength(0)
})

test('requires exports to be an object', async () => {
  const messages = await lint(`{
    "name": "@platformik/module-iam"
  }`)

  expect(messages).toHaveLength(1)
  expect(messages[0].message).toContain('"exports" as an object')
})

test('requires the contracts export', async () => {
  const messages = await lint(`{
    "name": "@platformik/module-iam",
    "exports": {
      ".": "./src/public/module.ts"
    }
  }`)

  expect(messages).toHaveLength(1)
  expect(messages[0].message).toContain('"./contracts"')
})

test('blocks extra public entry points', async () => {
  const messages = await lint(`{
    "name": "@platformik/module-iam",
    "exports": {
      ".": "./src/public/module.ts",
      "./contracts": "./src/public/contracts/index.ts",
      "./internal": "./src/public/internal.ts"
    }
  }`)

  expect(messages).toHaveLength(1)
  expect(messages[0].message).toContain('may expose only')
  expect(messages[0].message).toContain('"./internal"')
})

test('blocks export targets outside src/public', async () => {
  const messages = await lint(`{
    "name": "@platformik/module-iam",
    "exports": {
      ".": "./src/module.ts",
      "./contracts": "./src/public/contracts/index.ts"
    }
  }`)

  expect(messages).toHaveLength(1)
  expect(messages[0].message).toContain('must resolve only to files inside')
  expect(messages[0].message).toContain('./src/module.ts')
})

test('blocks conditional export targets outside src/public', async () => {
  const messages = await lint(`{
    "name": "@platformik/module-iam",
    "exports": {
      ".": "./src/public/module.ts",
      "./contracts": {
        "types": "./src/contracts.ts",
        "default": "./src/public/contracts/index.ts"
      }
    }
  }`)

  expect(messages).toHaveLength(1)
  expect(messages[0].message).toContain('"./contracts"')
  expect(messages[0].message).toContain('./src/contracts.ts')
})
