import { expect, test, beforeAll, afterAll } from 'bun:test'
import { ESLint } from 'eslint'
import tsParser from '@typescript-eslint/parser'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import rule from '../rules/no-cross-package-relative.ts'

const tmp = join(tmpdir(), `eslint-cross-pkg-test-${Date.now()}`)

beforeAll(() => {
  mkdirSync(join(tmp, 'packages/module-iam-ts/src/domain'), { recursive: true })
  writeFileSync(join(tmp, 'packages/module-iam-ts/package.json'), '{"name":"@platformik/module-iam-ts"}')

  mkdirSync(join(tmp, 'packages/module-chat-ts/src/use-cases'), { recursive: true })
  writeFileSync(join(tmp, 'packages/module-chat-ts/package.json'), '{"name":"@platformik/module-chat-ts"}')

  mkdirSync(join(tmp, 'apps/service-api-ts/src/routes'), { recursive: true })
  writeFileSync(join(tmp, 'apps/service-api-ts/package.json'), '{"name":"@platformik/service-api-ts"}')

  mkdirSync(join(tmp, 'configs/ts'), { recursive: true })
})

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

async function lint(code: string, filename: string) {
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
          'module-boundaries': { rules: { 'no-cross-package-relative': rule } },
        },
        rules: { 'module-boundaries/no-cross-package-relative': 'error' },
      },
    ],
  })

  const [result] = await eslint.lintText(code, { filePath: filename })

  return result.messages
}

// --- valid cases ---

test('allows ./relative import within same package', async () => {
  const f = join(tmp, 'packages/module-iam-ts/src/index.ts')

  expect(await lint("import { helper } from './helper'", f)).toHaveLength(0)
})

test('allows ../relative import staying within same package', async () => {
  const f = join(tmp, 'packages/module-iam-ts/src/index.ts')

  expect(await lint("import { something } from '../domain/entity'", f)).toHaveLength(0)
})

test('allows deep relative import that stays inside package', async () => {
  const f = join(tmp, 'packages/module-iam-ts/src/domain/index.ts')

  // ../../config resolves to <pkg>/config — still inside package root
  expect(await lint("import { config } from '../../config'", f)).toHaveLength(0)
})

test('ignores absolute monorepo imports (not relative)', async () => {
  const f = join(tmp, 'packages/module-iam-ts/src/index.ts')

  expect(await lint("import { User } from '@platformik/module-iam-ts/contracts'", f)).toHaveLength(0)
})

// --- invalid cases ---

test('blocks relative import escaping into another package', async () => {
  const f = join(tmp, 'packages/module-iam-ts/src/index.ts')
  const messages = await lint("import { UserEntity } from '../../module-chat-ts/src/domain/user'", f)

  expect(messages).toHaveLength(1)
  expect(messages[0].message).toContain('escapes the package boundary')
  expect(messages[0].message).toContain('../../module-chat-ts/src/domain/user')
})

test('blocks relative import from deeply nested file escaping to another package', async () => {
  const f = join(tmp, 'packages/module-chat-ts/src/use-cases/send.ts')
  const messages = await lint("import { UserEntity } from '../../../module-iam-ts/src/domain/user'", f)

  expect(messages).toHaveLength(1)
  expect(messages[0].message).toContain('escapes the package boundary')
})

test('blocks dynamic import escaping package boundary', async () => {
  const f = join(tmp, 'packages/module-iam-ts/src/index.ts')
  const messages = await lint("const mod = await import('../../module-chat-ts/src/use-cases/send')", f)

  expect(messages).toHaveLength(1)
  expect(messages[0].message).toContain('escapes the package boundary')
})

test('blocks relative import from app escaping into another package', async () => {
  const f = join(tmp, 'apps/service-api-ts/src/routes/users.ts')
  const messages = await lint("import { something } from '../../../packages/module-iam-ts/src/index'", f)

  expect(messages).toHaveLength(1)
  expect(messages[0].message).toContain('escapes the package boundary')
})
