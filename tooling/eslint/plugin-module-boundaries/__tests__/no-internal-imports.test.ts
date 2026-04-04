import { expect, test } from 'vitest'
import { ESLint } from 'eslint'
import tsParser from '@typescript-eslint/parser'

import rule from '../rules/no-internal-imports.ts'

const DEFAULT_FILENAME = '/repo/packages/some-lib/src/index.ts'

async function lint(code: string, filename = DEFAULT_FILENAME) {
  const eslint = new ESLint({
    cwd: '/',
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.{js,ts}'],
        languageOptions: {
          parser: tsParser,
          parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
        },
        plugins: {
          'module-boundaries': { rules: { 'no-internal-imports': rule } },
        },
        rules: {
          'module-boundaries/no-internal-imports': [
            'error',
            { monorepoScope: '@platformik', allowedSubpaths: ['contracts', 'migrations'] },
          ],
        },
      },
    ],
  })

  const [result] = await eslint.lintText(code, { filePath: filename })

  return result.messages
}

// --- valid cases ---

test('allows bare module import', async () => {
  expect(await lint("import { createIamModule } from '@platformik/module-iam'")).toHaveLength(0)
})

test('allows contracts subpath', async () => {
  expect(await lint("import type { User } from '@platformik/module-iam/contracts'")).toHaveLength(0)
})

test('allows migrations subpath', async () => {
  expect(await lint("import { iamMigrations } from '@platformik/module-iam/migrations'")).toHaveLength(0)
})

test('allows non-module packages (lib, runtime, vendor)', async () => {
  expect(await lint("import { pipe } from '@platformik/lib-fp'")).toHaveLength(0)
  expect(await lint("import { createPgPool } from '@platformik/runtime-pg'")).toHaveLength(0)
  expect(await lint("import { z } from 'zod'")).toHaveLength(0)
})

test('self-import exemption: file inside the same module can import internals', async () => {
  expect(
    await lint(
      "import { UserEntity } from '@platformik/module-iam/src/domain/user'",
      '/repo/packages/module-iam/src/index.ts',
    ),
  ).toHaveLength(0)
})

test('self-import exemption: deeply nested file inside same module', async () => {
  expect(
    await lint(
      "import { UserEntity } from '@platformik/module-iam/src/domain/user'",
      '/repo/packages/module-iam/src/adapters/pg/user-repo.ts',
    ),
  ).toHaveLength(0)
})

test('allows dynamic import of bare module', async () => {
  expect(await lint("const m = await import('@platformik/module-iam')")).toHaveLength(0)
})

test('allows dynamic import of contracts', async () => {
  expect(await lint("const m = await import('@platformik/module-iam/contracts')")).toHaveLength(0)
})

test('allows dynamic import of migrations', async () => {
  expect(await lint("const m = await import('@platformik/module-iam/migrations')")).toHaveLength(0)
})

// --- invalid cases ---

test('blocks internal src path', async () => {
  const messages = await lint("import { UserEntity } from '@platformik/module-iam/src/domain/user'")

  expect(messages).toHaveLength(1)
  expect(messages[0].message).toContain('Importing internal path')
  expect(messages[0].message).toContain('@platformik/module-iam/src/domain/user')
  expect(messages[0].message).toContain('@platformik/module-iam')
})

test('blocks internal src/module path', async () => {
  const messages = await lint("import { something } from '@platformik/module-iam/src/module'")

  expect(messages).toHaveLength(1)
  expect(messages[0].message).toContain('Importing internal path')
})

test('blocks non-allowed subpath (adapters)', async () => {
  const messages = await lint("import { repo } from '@platformik/module-iam/adapters'")

  expect(messages).toHaveLength(1)
  expect(messages[0].message).toContain('Importing internal path')
})

test('blocks deep internal path in another module', async () => {
  const messages = await lint("import { handler } from '@platformik/module-chat/src/use-cases/send'")

  expect(messages).toHaveLength(1)
  expect(messages[0].message).toContain('Importing internal path')
})

test('blocks dynamic import of internal path', async () => {
  const messages = await lint("const m = await import('@platformik/module-iam/src/adapters/user-repo')")

  expect(messages).toHaveLength(1)
  expect(messages[0].message).toContain('Importing internal path')
})
