# 003: Rewrite ESLint plugin — module boundary protection

## Context

Read `boundaries.md` first — it is the source of truth.

Previously, `tooling/eslint/plugin-boundaries` enforced dependency flow between roles. That concern has moved
to `tooling/dep-policy/`. ESLint now has a single responsibility: **protecting module boundaries at the import
statement level**.

Two rules, one goal: no code can reach into another package's internals.

## Rules overview

| Rule                        | What it prevents                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `no-internal-imports`       | `@platformik/module-iam-ts/src/domain/user` — absolute import bypassing `exports`    |
| `no-cross-package-relative` | `../../../module-iam-ts/src/domain/user` — relative import escaping package boundary |

## What to remove

Delete the old plugin-boundaries and all supporting files:

- `tooling/eslint/plugin-boundaries/`
- `tooling/eslint/typescript.boundaries.config.mjs`
- `tooling/eslint/typescript.boundaries.matrix.mjs`

## File structure

```
tooling/eslint/
├── base.config.mjs                           # existing — update to use new plugin
├── plugin-module-boundaries/
│   ├── index.ts                              # plugin entry: exports rules
│   ├── rules/
│   │   ├── no-internal-imports.ts            # rule 1
│   │   └── no-cross-package-relative.ts      # rule 2
│   └── __tests__/
│       ├── no-internal-imports.test.ts
│       └── no-cross-package-relative.test.ts
├── package.json
└── tsconfig.json
```

## Rule 1: `no-internal-imports`

Prevents importing module internals via absolute package paths.

### Logic

1. Visit every `ImportDeclaration` and `ImportExpression` (dynamic import).
2. Extract the import source string.
3. Check if the source starts with `<monorepoScope>/module-`.
4. If it does, verify the import path is either:
   - Bare package name (e.g. `@platformik/module-iam-ts`) → `"."` export
   - Package name + `/contracts` (e.g. `@platformik/module-iam-ts/contracts`) → `"./contracts"`
5. Any other subpath → report violation.
6. **Self-import exemption**: if the importing file is inside the same module package, skip.

### Options

```ts
{
  monorepoScope: '@platformik',
  allowedSubpaths: ['contracts'],
}
```

### Error message

```
Importing internal path "@platformik/module-iam-ts/src/domain/user" is not allowed.
Use "@platformik/module-iam-ts" or "@platformik/module-iam-ts/contracts" instead.
```

### Valid cases

```ts
import { createIamModule } from '@platformik/module-iam-ts'
import type { User } from '@platformik/module-iam-ts/contracts'
import { pipe } from '@platformik/lib-fp-ts'
import { createPgPool } from '@platformik/runtime-postgres-ts'
import { z } from 'zod'
```

### Invalid cases

```ts
import { UserEntity } from '@platformik/module-iam-ts/src/domain/user'
import { something } from '@platformik/module-iam-ts/src/module'
import { repo } from '@platformik/module-iam-ts/adapters'
import { handler } from '@platformik/module-chat-ts/src/use-cases/send'
const mod = await import('@platformik/module-iam-ts/src/adapters/user-repo')
```

## Rule 2: `no-cross-package-relative`

Prevents relative imports that escape the current package boundary.

### Logic

1. Visit every `ImportDeclaration` and `ImportExpression` with a relative source (`./` or `../`).
2. Determine the **package root** of the importing file: the closest parent directory containing a
   `package.json`. Cache this per-file — walk up once and store.
3. Resolve the import path relative to the importing file's directory.
4. If the resolved path is outside the package root → report violation.

### Detection approach

No need to actually read `package.json` or resolve real file paths at lint time. Use a simpler heuristic:

1. Count how many directories up `../` goes from the current file.
2. If it exits the package root directory → violation.

To find the package root at rule creation time, walk up from the current file's directory until a
`package.json` is found. ESLint provides the filename via context.

```ts
function findPackageRoot(filePath: string): string {
  let dir = path.dirname(filePath)
  while (dir !== path.parse(dir).root) {
    if (existsSync(path.join(dir, 'package.json'))) {
      return dir
    }
    dir = path.dirname(dir)
  }
  return dir
}

function isOutsidePackage(importSource: string, filePath: string, packageRoot: string): boolean {
  const fileDir = path.dirname(filePath)
  const resolved = path.resolve(fileDir, importSource)
  return !resolved.startsWith(packageRoot)
}
```

### Error message

```
Relative import "../../../module-iam-ts/src/domain/user" escapes the package boundary.
Use a package dependency instead (e.g. "@platformik/module-iam-ts/contracts").
```

### Valid cases

```ts
// Relative imports within the same package — always ok
import { something } from '../domain/entity'
import { helper } from './helper'
import { config } from '../../config'

// Absolute monorepo imports — handled by rule 1, not this rule
import { User } from '@platformik/module-iam-ts/contracts'
```

### Invalid cases

```ts
// Escapes package root into another package
import { UserEntity } from '../../../module-iam-ts/src/domain/user'

// Escapes into configs
import { config } from '../../../../configs/ts/tsconfig.base.json'

// Escapes into another app
import { handler } from '../../../apps/service-api-ts/src/routes/users'

// Dynamic import escaping boundary
const mod = await import('../../module-chat-ts/src/use-cases/send')
```

## Integration with base.config.mjs

Update `tooling/eslint/base.config.mjs`:

```js
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig } from 'eslint/config'
import moduleBoundaries from './plugin-module-boundaries/index.ts'

export default defineConfig(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/.moon/**', '**/bun.lockb'],
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
```

## Tests

Use `bun:test`. For ESLint rule testing use `RuleTester` from `eslint`.

Both rules need tests for:

- All valid/invalid cases listed above.
- Dynamic `import()` expressions.
- Self-import exemption (rule 1 only).
- Edge cases: single `./` import, deeply nested files, packages at different directory depths.

## Constraints

- Two rules, two files — keep each rule self-contained.
- No dependencies beyond ESLint core types and `node:path` / `node:fs`.
- Both rules must work with static `import` and dynamic `import()`.
- The monorepo scope and allowed subpaths must be configurable via rule options, not hardcoded.
- Run with `bun test`.
