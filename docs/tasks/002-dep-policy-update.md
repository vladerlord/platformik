# 002: Update dep-policy checker for new modular architecture

## Context

This plan supersedes parts of `001-dep-policy-checker.md`. The monorepo architecture has been restructured from 12
package roles to 6. Read `boundaries.md` first — it is the source of truth. If anything in this plan conflicts with
`boundaries.md`, `boundaries.md` wins.

The tool structure from 001 (config → discovery → parsers → validator → reporter → CLI) remains valid. This plan
describes **only the changes**.

## What changed in the architecture

### Roles: 12 → 6

Old roles removed: `domain`, `ports`, `adapter`, `workflows`, `migrations`, `testkit`.

These are now **internal concerns** of `module` packages — they may exist as directories inside a module but are not
separate packages.

New role set:

| Role        | Purpose                                              |
| ----------- | ---------------------------------------------------- |
| `module`    | Self-contained business capability (bounded context) |
| `contracts` | Shared cross-boundary schemas (zod, protobuf)        |
| `lib`       | Pure technical utilities, zero IO                    |
| `runtime`   | Infrastructure lifecycle (pg, redis, fastify, pino)  |
| `vendor`    | External provider wrappers (Stripe, OpenAI, AWS)     |
| `app`       | Deployable entrypoint, wiring, orchestration         |

### Naming convention change

Old: `packages/<role>-<module>-<lang>`

New: `packages/<role>-<n>-<lang|schema>`

- `<module>` placeholder renamed to `<n>` to avoid collision with `module` role.
- `<lang|schema>` — a package ends with either a language code (`ts`, `py`, `rs`, `go`, `kt`, `sw`) or a schema code
  (`proto`, `jsonschema`).

### Dependency flow

Old (12 entries):

```
app: lib, domain, ports, contracts, module, workflows, adapter, runtime, vendor
lib: lib
domain: lib
ports: lib, domain
contracts: lib
module: lib, domain, ports, contracts
workflows: lib, ports, contracts, runtime
adapter: lib, domain, ports, runtime, vendor
runtime: lib
vendor: lib
migrations: lib, runtime
testkit: lib, domain, ports, module
```

New (6 entries):

```
app: lib, module, contracts, runtime, vendor
module: lib, runtime, vendor
contracts: lib
lib: lib
runtime: lib
vendor: lib
```

### External dependency policy

Old:

```yaml
lib: deny_all
domain: deny_all
ports: deny_all
contracts: allow [zod, ...]
module: deny [pg, ioredis, ...]
runtime: allow_any
vendor: allow_any
adapter: allow_any
workflows: allow_any
migrations: allow_any
testkit: allow_any
app: allow_any
```

New:

```yaml
lib: allow [neverthrow, decimal.js, uuid, ...]
module: allow_any
contracts: allow [zod, ...]
runtime: allow_any
vendor: allow_any
app: allow_any
```

Key differences:

- `lib` changed from `deny_all` to `allow` (curated list of pure computational libs).
- `module` changed from `deny` (blocklist) to `allow_any` (unrestricted).
- 6 removed roles no longer need rules.

## Changes to implement

### 1. Update `policy.yaml`

Replace entire content with:

```yaml
monorepoScope: '@platformik'

rules:
  lib:
    mode: allow
    packages:
      ts: [neverthrow]

  module:
    mode: allow_any

  contracts:
    mode: allow
    packages:
      ts: [zod]
      rs: [serde, prost]
      go: [google.golang.org/protobuf]
      py: [pydantic]

  runtime:
    mode: allow_any

  vendor:
    mode: allow_any

  app:
    mode: allow_any
```

### 2. Update `discovery.ts`

Classification must handle both `<lang>` and `<schema>` suffixes.

Valid language codes: `ts`, `py`, `go`, `rs`, `kt`, `sw`. Valid schema codes: `proto`, `jsonschema`.

The last hyphen-separated token of the directory name is always `<lang|schema>`.

For packages:

- `packages/module-iam-ts` → `{ role: 'module', name: 'iam', suffix: 'ts', kind: 'lang' }`
- `packages/contracts-ai-proto` → `{ role: 'contracts', name: 'ai', suffix: 'proto', kind: 'schema' }`

For apps (unchanged logic, always `<lang>`):

- `apps/service-api-ts` → `{ role: 'app', name: 'api', suffix: 'ts', kind: 'lang' }`
- `apps/bff-web-platform-ts` → `{ role: 'app', name: 'bff-web-platform', suffix: 'ts', kind: 'lang' }`

Schema packages (`kind: 'schema'`) should be **skipped** during validation — they have no runtime dependencies to check.

### 3. Update `config.ts`

Valid roles list changes from:

```ts
;[
  'lib',
  'domain',
  'ports',
  'contracts',
  'module',
  'workflows',
  'adapter',
  'runtime',
  'vendor',
  'migrations',
  'testkit',
  'app',
]
```

to:

```ts
;['lib', 'module', 'contracts', 'runtime', 'vendor', 'app']
```

### 4. Update `validator.ts`

No logic changes needed — the four modes (`deny_all`, `allow`, `deny`, `allow_any`) still work. But `deny` and
`deny_all` modes are no longer used in the default config. Keep support for them — they may be useful later.

Add dependency flow validation as a new check: verify that packages only depend on internal monorepo packages of allowed
roles per the dependency flow matrix:

```ts
const DEPENDENCY_FLOW: Record<string, string[]> = {
  app: ['lib', 'module', 'contracts', 'runtime', 'vendor'],
  module: ['lib', 'runtime', 'vendor'],
  contracts: ['lib'],
  lib: ['lib'],
  runtime: ['lib'],
  vendor: ['lib'],
}
```

For each package, check that its internal (monorepo-scoped) dependencies only reference packages whose role is in the
allowed list. For example, if `module-iam-ts` depends on `@platformik/module-billing-ts`, that's a violation — `module`
cannot depend on `module`.

This means the validator now checks **two things**:

1. External dependency policy (existing) — which third-party packages are allowed.
2. Internal dependency flow (new) — which monorepo package roles can be depended on.

To resolve the role of an internal dependency, use the same classification logic from `discovery.ts`.

### 5. Update `reporter.ts`

Add reporting for dependency flow violations. Example output:

```
✗ packages/module-iam-ts (role: module)
    @platformik/module-billing-ts — "module" cannot depend on "module"

✗ packages/lib-fp-ts (role: lib, mode: allow)
    lodash — "lodash" is not in the allowed list for role "lib" (ts)

Found 2 violations in 2 packages.
```

### 6. Update fixtures

Remove fixtures for deleted roles (`domain-billing-ts`, `adapter-billing-rs`).

Updated fixture set:

**`packages/lib-fp-ts/package.json`** — clean (neverthrow is allowed):

```json
{ "name": "@platformik/lib-fp-ts", "dependencies": { "neverthrow": "^8.0.0" } }
```

**`packages/lib-logger-ts/package.json`** — clean (no external deps):

```json
{ "name": "@platformik/lib-logger-ts", "dependencies": {} }
```

**`packages/module-iam-ts/package.json`** — clean (module is unrestricted):

```json
{
  "name": "@platformik/module-iam-ts",
  "dependencies": {
    "@platformik/lib-fp-ts": "workspace:*",
    "@platformik/runtime-postgres-ts": "workspace:*",
    "zod": "catalog:",
    "pg": "catalog:"
  }
}
```

**`packages/module-chat-ts/package.json`** — violation (depends on another module):

```json
{
  "name": "@platformik/module-chat-ts",
  "dependencies": {
    "@platformik/module-iam-ts": "workspace:*",
    "@platformik/runtime-postgres-ts": "workspace:*"
  }
}
```

**`packages/contracts-platform-api-ts/package.json`** — clean (zod allowed):

```json
{ "name": "@platformik/contracts-platform-api-ts", "dependencies": { "zod": "catalog:" } }
```

**`packages/contracts-ai-proto/`** — no manifest to check (schema package, skipped).

**`packages/runtime-postgres-ts/package.json`** — clean (unrestricted):

```json
{
  "name": "@platformik/runtime-postgres-ts",
  "dependencies": { "pg": "catalog:", "pg-pool": "catalog:" }
}
```

**`packages/vendor-openai-ts/package.json`** — clean (unrestricted):

```json
{ "name": "@platformik/vendor-openai-ts", "dependencies": { "openai": "catalog:" } }
```

**`apps/service-api-ts/package.json`** — clean (app is unrestricted):

```json
{
  "name": "@platformik/service-api-ts",
  "dependencies": {
    "@platformik/module-iam-ts": "workspace:*",
    "@platformik/module-chat-ts": "workspace:*",
    "@platformik/contracts-platform-api-ts": "workspace:*",
    "@platformik/runtime-postgres-ts": "workspace:*",
    "@platformik/runtime-fastify-ts": "workspace:*",
    "fastify": "catalog:",
    "pino": "catalog:"
  }
}
```

### 7. Update tests

- **`config.test.ts`**: update valid roles list.
- **`discovery.test.ts`**: add tests for `<schema>` suffix classification; verify schema packages are identified
  correctly; update existing tests for `<n>` naming.
- **`validator.test.ts`**: add tests for dependency flow validation (module → module = violation, module → lib = ok,
  contracts → runtime = violation, etc.); update external dep tests for new policy (lib is now `allow` not `deny_all`).
- **`integration.test.ts`**: update fixtures, verify both external and internal dependency violations are caught in one
  pass.

## Summary of file changes

| File               | Change                                                        |
| ------------------ | ------------------------------------------------------------- |
| `policy.yaml`      | Replace entirely — 6 roles, new policies                      |
| `src/config.ts`    | Update valid roles list                                       |
| `src/discovery.ts` | Handle `<schema>` suffixes, rename `module` → `name` in types |
| `src/validator.ts` | Add dependency flow check for internal deps                   |
| `src/reporter.ts`  | Add reporting for dependency flow violations                  |
| `__fixtures__/`    | Replace all — new roles, new violation cases                  |
| `__tests__/`       | Update for new roles, add dependency flow tests               |
