# Task: Implement `tooling/dep-policy` — Cross-Language Dependency Policy Checker

## Context

We maintain a polyglot monorepo with strict architectural boundaries defined in `boundaries.md` at the repo
root. Package naming follows a deterministic convention:

- `apps/<client>-<module>-<lang>` (and `bff-*`, `service-*`, `worker-*` variants)
- `packages/<role>-<module>-<lang>`

Where `<role>` is one of: `lib`, `domain`, `ports`, `contracts`, `module`, `workflows`, `adapter`, `runtime`,
`vendor`, `migrations`, `testkit`.

We already enforce **source-level import boundaries** between roles via an ESLint plugin
(`tooling/eslint/plugin-boundaries`). However, we have no enforcement over **which external (third-party)
packages** a given role is allowed to install. For example, nothing prevents `domain-billing-ts` from
declaring `pino` in its `package.json`, which would violate `boundaries.md` ("no external dependencies").

This tool closes that gap.

## Important: `boundaries.md` is the source of truth

Read `boundaries.md` before implementing. The policy rules below are a **direct translation** of the role
descriptions in that document. If you see any conflict between this task and `boundaries.md`, `boundaries.md`
wins.

## Goal

Create a standalone CLI tool at `tooling/dep-policy/` that validates external dependency declarations across
all workspace packages against a role-based policy defined in YAML.

The tool must:

1. Parse the policy config (`policy.yaml`).
2. Discover all workspace packages under `apps/` and `packages/`.
3. Classify each package by role and language using its directory name.
4. Read the package manifest (e.g. `package.json` for TypeScript) and extract declared external dependencies.
5. Filter out internal monorepo packages (anything under `@platformik/` scope).
6. Validate external dependencies against the policy rules for that role + language.
7. Report violations with clear, actionable error messages.
8. Exit with code 1 if any violations are found.

## Tech Stack

- **Language**: TypeScript (runs with `bun`).
- **Config format**: YAML (use `yaml` npm package for parsing).
- **Test runner**: `bun test` (built-in — do NOT use vitest, jest, or any external test framework).
- **No other runtime dependencies** — keep it minimal.

## Classification Rules

### Packages

Directory name: `packages/<role>-<module>-<lang>`

Extract via regex or split: first segment = role, last segment = lang, everything in between = module.

Examples:

- `packages/domain-billing-ts` → `{ role: 'domain', module: 'billing', lang: 'ts' }`
- `packages/lib-fp-ts` → `{ role: 'lib', module: 'fp', lang: 'ts' }`
- `packages/runtime-postgres-ts` → `{ role: 'runtime', module: 'postgres', lang: 'ts' }`

### Apps

Directory name: `apps/<anything>-<lang>`

All apps collapse into a single role `app`. Lang is always the **last hyphen-separated token**.

Examples:

- `apps/service-billing-ts` → `{ role: 'app', lang: 'ts' }`
- `apps/bff-web-platform-host-ts` → `{ role: 'app', lang: 'ts' }`
- `apps/worker-checkout-ts` → `{ role: 'app', lang: 'ts' }`
- `apps/cli-platform-rs` → `{ role: 'app', lang: 'rs' }`

## Policy Config Format

The policy config lives at `tooling/dep-policy/policy.yaml`.

```yaml
# tooling/dep-policy/policy.yaml

# Monorepo package scope — used to filter out internal dependencies
monorepoScope: '@platformik'

rules:
  # --- boundaries.md: "zero IO, no external SDK dependencies" ---
  lib:
    mode: deny_all

  # --- boundaries.md: "no port interfaces, no IO, no external dependencies" ---
  domain:
    mode: deny_all

  # --- boundaries.md: "no implementations, no IO, no external dependencies" ---
  ports:
    mode: deny_all

  # --- boundaries.md: "external dependencies limited to schema/serialization libraries only" ---
  contracts:
    mode: allow
    packages:
      ts: [zod]
      rs: [serde, prost]
      go: [google.golang.org/protobuf]
      py: [pydantic]

  # --- boundaries.md: "no direct infrastructure client dependencies" ---
  module:
    mode: deny
    packages:
      ts:
        [
          pg,
          pg-pool,
          ioredis,
          redis,
          pino,
          fastify,
          bullmq,
          amqplib,
          temporal-client,
          '@temporalio/client',
          '@temporalio/worker',
          kafkajs,
          mongoose,
          prisma,
          '@prisma/client',
          drizzle-orm,
          knex,
          sequelize,
          typeorm,
        ]

  # --- unrestricted roles ---
  runtime:
    mode: allow_any

  vendor:
    mode: allow_any

  adapter:
    mode: allow_any

  workflows:
    mode: allow_any

  migrations:
    mode: allow_any

  testkit:
    mode: allow_any

  # --- apps do wiring — unrestricted ---
  app:
    mode: allow_any
```

### Rule Modes

| Mode        | Behavior                                                   |
| ----------- | ---------------------------------------------------------- |
| `deny_all`  | No external dependencies allowed. Any external dep fails.  |
| `allow`     | Only listed packages are permitted. Everything else fails. |
| `deny`      | Listed packages are forbidden. Everything else passes.     |
| `allow_any` | No restrictions on external dependencies.                  |

The `packages` field in `allow` and `deny` modes is keyed by language code (`ts`, `rs`, `go`, `py`, `kt`,
`sw`). If a language is not listed, the default behavior depends on the mode:

- `allow` mode + language not listed → no external deps allowed for that language.
- `deny` mode + language not listed → no deps blocked for that language.

## Architecture / File Structure

```
tooling/dep-policy/
├── src/
│   ├── index.ts              # CLI entrypoint (parse args, run, report, exit code)
│   ├── config.ts             # Load and validate policy.yaml
│   ├── discovery.ts          # Find all workspace packages, classify by role/lang
│   ├── parsers/
│   │   ├── types.ts          # ManifestParser interface
│   │   ├── typescript.ts     # Parse package.json → external dep names
│   │   ├── rust.ts           # Parse Cargo.toml → external dep names
│   │   ├── go.ts             # Parse go.mod → external dep names
│   │   └── python.ts         # Parse pyproject.toml → external dep names
│   ├── validator.ts          # Core validation logic: deps × policy → violations
│   └── reporter.ts           # Format violations for terminal output
├── __tests__/
│   ├── config.test.ts
│   ├── discovery.test.ts
│   ├── parsers/
│   │   ├── typescript.test.ts
│   │   ├── rust.test.ts
│   │   ├── go.test.ts
│   │   └── python.test.ts
│   ├── validator.test.ts
│   └── integration.test.ts   # End-to-end with fixture packages
├── __fixtures__/              # Minimal fake packages for testing
│   ├── packages/
│   │   ├── lib-fp-ts/
│   │   │   └── package.json
│   │   ├── domain-billing-ts/
│   │   │   └── package.json
│   │   ├── contracts-billing-ts/
│   │   │   └── package.json
│   │   ├── module-billing-ts/
│   │   │   └── package.json
│   │   ├── runtime-postgres-ts/
│   │   │   └── package.json
│   │   └── adapter-billing-rs/
│   │       └── Cargo.toml
│   └── apps/
│       └── service-billing-ts/
│           └── package.json
├── policy.yaml
├── package.json
└── tsconfig.json
```

## Module Responsibilities

### `config.ts`

- Reads and parses `policy.yaml`.
- Validates the config shape (all roles present, valid modes, correct structure).
- Exports a typed `PolicyConfig` object.

### `discovery.ts`

- Scans `apps/` and `packages/` directories.
- Classifies each directory name into `{ role, module, lang, path }`.
  - `apps/*` → role is always `app`, lang is last hyphen-separated token.
  - `packages/<role>-<module>-<lang>` → extract role (first token), module (middle tokens), lang (last token).
- Skips directories that don't match the naming convention (with a warning to stderr).

### `parsers/*.ts`

- Each parser implements:
  ```ts
  interface ManifestParser {
    /** List of external dependency names declared in the manifest */
    parse(packageDir: string): string[]
  }
  ```
- `typescript.ts`: reads `package.json`, extracts keys from `dependencies` and `peerDependencies` (not
  `devDependencies`).
- `rust.ts`: reads `Cargo.toml`, extracts `[dependencies]` keys (skip `[dev-dependencies]`).
- `go.ts`: reads `go.mod`, extracts `require` block entries.
- `python.ts`: reads `pyproject.toml`, extracts `project.dependencies`.

### `validator.ts`

- Core pure function:
  ```ts
  function validate(deps: string[], rule: PolicyRule, lang: string, monorepoScope: string): Violation[]
  ```
- Filters out monorepo-scoped packages before checking.
- Applies the correct mode logic (`deny_all`, `allow`, `deny`, `allow_any`).
- Returns an array of `Violation` objects: `{ dependency: string; reason: string }`.

### `reporter.ts`

- Formats violations for terminal output.
- Groups by package. Shows role, path, and each violation.
- Example output:

  ```
  ✗ packages/domain-billing-ts (role: domain, mode: deny_all)
      pino — no external dependencies allowed for role "domain"
      lodash — no external dependencies allowed for role "domain"

  ✗ packages/module-billing-ts (role: module, mode: deny)
      pg — "pg" is explicitly forbidden for role "module" (ts)

  Found 3 violations in 2 packages.
  ```

### `index.ts`

- CLI entrypoint.
- Accepts optional `--config <path>` (defaults to `tooling/dep-policy/policy.yaml`).
- Accepts optional `--root <path>` (defaults to monorepo root).
- Runs the full pipeline: config → discovery → parse → validate → report.
- Exits with code 0 if clean, code 1 if violations found.

## Tests

Use `bun:test` for all tests:

```ts
import { describe, test, expect } from 'bun:test'
```

Run with `bun test`. No test runner config file needed — `bun test` auto-discovers `*.test.ts`.

### Unit Tests

- **`config.test.ts`**: valid config parses correctly; missing fields throw; unknown modes throw.
- **`discovery.test.ts`**: classifies `packages/domain-billing-ts` →
  `{ role: 'domain', module: 'billing', lang: 'ts' }`; classifies `apps/service-billing-ts` →
  `{ role: 'app', ... }`; classifies `apps/bff-web-platform-host-ts` → `{ role: 'app', lang: 'ts' }`; skips
  malformed directory names.
- **`parsers/typescript.test.ts`**: extracts `dependencies` + `peerDependencies`; ignores `devDependencies`;
  handles missing fields gracefully.
- **`parsers/rust.test.ts`**: extracts from `[dependencies]`; ignores `[dev-dependencies]`.
- **`parsers/go.test.ts`**: extracts from `require (...)` block.
- **`parsers/python.test.ts`**: extracts from `[project] dependencies`.
- **`validator.test.ts`**:
  - `deny_all`: any external dep → violation.
  - `allow`: listed dep → pass; unlisted dep → violation.
  - `deny`: listed dep → violation; unlisted dep → pass.
  - `allow_any`: everything passes.
  - Monorepo-scoped deps are always filtered out before validation.
  - Language not listed in `allow` mode → treated as empty allowlist.
  - Language not listed in `deny` mode → treated as empty blocklist.

### Integration Test

- **`integration.test.ts`**: uses the `__fixtures__/` directory as a fake monorepo root. Runs the full
  pipeline with a test policy config. Asserts correct violations for known-bad fixtures and clean passes for
  known-good fixtures.

## Fixture Definitions

Use these for testing. Some are intentionally invalid to trigger violations:

**`packages/lib-fp-ts/package.json`** — clean (no external deps):

```json
{ "name": "@platformik/lib-fp-ts", "dependencies": {} }
```

**`packages/domain-billing-ts/package.json`** — violation (has `pino`):

```json
{
  "name": "@platformik/domain-billing-ts",
  "dependencies": { "@platformik/lib-fp-ts": "workspace:*", "pino": "^9.0.0" }
}
```

**`packages/contracts-billing-ts/package.json`** — clean (only `zod`, which is allowed):

```json
{ "name": "@platformik/contracts-billing-ts", "dependencies": { "zod": "catalog:" } }
```

**`packages/module-billing-ts/package.json`** — violation (has `pg`, which is forbidden):

```json
{
  "name": "@platformik/module-billing-ts",
  "dependencies": {
    "@platformik/lib-fp-ts": "workspace:*",
    "@platformik/domain-billing-ts": "workspace:*",
    "@platformik/ports-billing-ts": "workspace:*",
    "pg": "^8.0.0"
  }
}
```

**`packages/runtime-postgres-ts/package.json`** — clean (runtime allows anything):

```json
{
  "name": "@platformik/runtime-postgres-ts",
  "dependencies": { "pg": "^8.0.0", "pg-pool": "^3.0.0" }
}
```

**`packages/adapter-billing-rs/Cargo.toml`** — clean (adapter allows anything):

```toml
[package]
name = "adapter-billing"

[dependencies]
sqlx = "0.7"
serde = { version = "1.0", features = ["derive"] }
```

**`apps/service-billing-ts/package.json`** — clean (apps allow anything):

```json
{
  "name": "@platformik/service-billing-ts",
  "dependencies": {
    "@platformik/module-billing-ts": "workspace:*",
    "@platformik/runtime-postgres-ts": "workspace:*",
    "fastify": "catalog:",
    "pino": "catalog:"
  }
}
```

## Running

```bash
# From monorepo root
bun run tooling/dep-policy/src/index.ts

# With explicit args
bun run tooling/dep-policy/src/index.ts --root . --config tooling/dep-policy/policy.yaml

# Run tests
cd tooling/dep-policy && bun test
```

Add to root `package.json` scripts:

```json
{
  "scripts": {
    "check:deps": "bun run tooling/dep-policy/src/index.ts"
  }
}
```

## Constraints

- Keep total implementation under ~500 lines (excluding tests and fixtures).
- Each module should be independently testable — no side effects at import time.
- All functions that do IO (reading files, scanning dirs) should accept the root path as a parameter, never
  use hardcoded paths.
- Parsers should handle missing manifest files gracefully (warn and skip, don't crash).
- Use explicit TypeScript types — no `any`.
