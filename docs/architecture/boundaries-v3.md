# Architecture Boundaries and Dependencies v3

## Purpose

This document defines the dependency policy for the monorepo.

It is:

- the human-readable architecture contract
- the source of truth for linting/validation rules
- the reference for adding new apps and packages safely

## Audience and document type

- Type: Reference (with short rationale sections)
- Audience: engineers and agents changing code structure or dependencies
- Goal: quickly determine whether a dependency is allowed

## Scope

- Applies to all projects under `apps/`, `packages/`, `configs/`, and `tooling/`.
- Rules are language-agnostic and evaluated per language token (`py|ts|go|rs`).
- Source-level cross-language imports are forbidden.

Cross-language interaction is allowed only through:

- network APIs
- language-neutral schema/IDL and generated artifacts

## Monorepo Structure Overview

| Root | Purpose | Dependency posture |
| --- | --- | --- |
| `apps/` | Deployable composition roots. | May compose runtime packages; must not depend on tooling code. |
| `packages/` | Reusable runtime libraries. | Must follow role-based dependency matrix. |
| `configs/` | Shared static configuration assets. | Must remain internal-dependency-free. |
| `tooling/` | Repo validation/build/dev executables and scripts. | Must not depend on runtime code (`apps/`, `packages/`). |

In this document, "no dependencies" for `configs/` and `tooling/` means no internal repo
dependencies on runtime paths (`apps/*`, `packages/*`).

## Naming Inputs (Classification)

For strict naming formats, see [naming.md](/docs/architecture/naming.md).

This policy derives dependency class from project name.

### Apps

Pattern: `apps/<role>-<service>-<lang>`

- `<role>`: `web|bff|worker|service|cli`
- `<service>`: kebab-case ownership/capability token
- `<lang>`: `py|ts|go|rs`

Examples:

- `apps/web-platform-ts`
- `apps/bff-platform-py`

### Bounded context packages

Pattern: `packages/<lang>-<context>-<role>`

- `<lang>`: `py|ts|go|rs`
- `<context>`: kebab-case token
- `<role>`: `domain|workflows|infra|migrations`

Examples:

- `packages/ts-billing-domain`
- `packages/py-orchestration-workflows`

### Shared packages

Pattern: `packages/<lang>-(lib|infra|platform)-<name>(-<subname>...)*`

Examples:

- `packages/ts-lib-logger`
- `packages/py-infra-postgres`
- `packages/ts-platform-openai`

## Classification Keys

Every project maps to one key:

- `app`
- `bounded:domain`
- `bounded:workflows`
- `bounded:infra`
- `bounded:migrations`
- `shared:lib`
- `shared:infra`
- `shared:platform`

## Canonical Dependency Matrix

This matrix is normative for role-based dependencies between `apps/*` and `packages/*`.

| From                 | Allowed To                                                                            | Constraints                                                                          |
| -------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `app`                | `bounded:workflows`, `bounded:infra`, `shared:lib`, `shared:infra`, `shared:platform` | Must not depend on apps, `bounded:domain`, `bounded:migrations`, or `tooling/*` |
| `bounded:domain`     | `shared:lib`                                                                          | No bounded cross-context imports                                                     |
| `bounded:workflows`  | `bounded:domain`, `shared:lib`, `shared:infra`, `shared:platform`                     | Cross-context allowed only to `bounded:domain`                                       |
| `bounded:infra`      | `bounded:domain`, `shared:lib`, `shared:infra`                                        | `bounded:domain` must be same context                                                |
| `bounded:migrations` | `shared:lib`, `shared:infra`                                                          | Must not depend on any bounded package                                               |
| `shared:lib`         | `shared:lib`                                                                          | Keep pure and reusable                                                               |
| `shared:infra`       | `shared:lib`, `shared:infra`                                                          | No bounded/app coupling                                                              |
| `shared:platform`    | `shared:lib`, `shared:infra`                                                          | Wrap external providers only                                                         |

## Top-Level Directory Dependency Policy

These rules are directory-level policy and complement the role-based matrix.

`apps/*`

- May depend on `packages/*` and consume static configuration from `configs/*`.
- Must not depend on `tooling/*` code.

`packages/*`

- May depend on `packages/*` (per matrix) and consume static configuration from `configs/*`.
- Must not depend on `apps/*`.
- Must not depend on `tooling/*` code.

`configs/*`

- Must not import/execute code from `apps/*`, `packages/*`, or `tooling/*`.
- Should remain static configuration data and config declarations.

`tooling/*`

- Must not import from `apps/*` or `packages/*`.
- May read `configs/*` and use external tool dependencies.

## Global Invariants

These constraints always apply, even if a local rule appears permissive.

1. No source-level cross-language imports.
2. `packages/*` must not import `apps/*`.
3. `apps/*` must not import other `apps/*`.
4. Runtime paths (`app`, bounded packages, shared runtime packages) must not depend on `tooling/*`.
5. `configs/*` must stay configuration-only and internal-dependency-free.
6. `tooling/*` must stay independent from runtime code (`apps/*`, `packages/*`).

## Role Intent (Why these boundaries exist)

Intent is explanatory. Legality is defined by the matrix.

### `domain`

Contains business invariants, domain events, ports, and public domain types.

Must avoid orchestration logic and concrete SDK/client usage.

### `workflows`

Contains use-cases/orchestration across one or more domains.

This is the only bounded role allowed to cross context boundaries, and only via other contexts'
`domain`.

### `infra` (bounded)

Contains context-specific adapters implementing domain ports.

Adapters stay inside their context to avoid context-to-context infrastructure coupling.

### `migrations`

Contains schema changes and migration runners.

Isolated to prevent runtime/domain coupling with migration mechanics.

### Shared groups

- `shared:lib`: pure shared helpers and cross-cutting logic without infrastructure coupling
- `shared:infra`: internal technical primitives/wrappers (DB, queue, cache, etc.)
- `shared:platform`: wrappers for third-party/external providers

## Composition Root Rules (`apps/*`)

Apps are deployable composition roots. They may:

- read environment variables
- instantiate/configure clients (DB, queue, cache, LLM, Temporal, etc.)
- wire implementations into workflow/domain-facing interfaces

Apps should prefer importing workflows (`<lang>-*-workflows`) as their main business entry points.

## Practical Examples

Allowed:

- `apps/web-platform-ts` -> `@platformik/ts-billing-workflows`
- `packages/ts-billing-workflows` -> `@platformik/ts-org-domain`
- `packages/ts-billing-infra` -> `@platformik/ts-billing-domain`
- `packages/ts-platform-openai` -> `@platformik/ts-infra-http`
- `tooling/eslint/*` -> external ESLint ecosystem dependencies
- `tooling/*` reading static files from `configs/*`

Forbidden:

- `apps/web-platform-ts` -> `@platformik/ts-billing-domain`
- `apps/bff-platform-py` -> `@platformik/ts-billing-workflows` (cross-language)
- `packages/ts-billing-domain` -> `@platformik/ts-org-domain` (cross-context domain)
- `packages/ts-billing-infra` -> `@platformik/ts-org-domain` (cross-context bounded import)
- `packages/ts-lib-logger` -> `@platformik/ts-platform-openai`
- any runtime code -> `tooling/*`
- `tooling/eslint/*` -> `@platformik/ts-billing-workflows`
- any file in `configs/*` importing code from `apps/*` or `packages/*`

## Enforcement Mapping

When this policy changes, update and validate these artifacts in the same change set:

1. [boundaries-v3.md](/docs/architecture/boundaries-v3.md)
2. `tooling/eslint/typescript.boundaries.matrix.mjs`
3. `tooling/eslint/typescript.boundaries.config.mjs`
4. `eslint.config.mjs`
5. `tooling/eslint/plugin-boundaries/rules/dependency-graph.js`
6. `tooling/eslint/plugin-boundaries/rules/dependency-graph.test.js`
7. [naming.md](/docs/architecture/naming.md) (if naming/classification tokens change)

Current enforcement note:

- `configs/*` and `tooling/*` constraints above are documented architecture policy.
- Existing boundary classifier currently enforces role-based `apps/*` and `packages/*` rules.
- Full automated enforcement for `configs/*` and `tooling/*` is a follow-up task.

### Future enforcement

Planned follow-up implementation:

1. Extend classifier to recognize `configs` and `tooling` classes.
2. Extend dependency matrix keys for those classes.
3. Add rule tests for allowed/forbidden edges involving `configs/*` and `tooling/*`.

## Precedence

If any section is interpreted as conflicting, precedence is:

1. Canonical Dependency Matrix
2. Global Invariants
3. Composition Root Rules
4. Role Intent and examples

## Review Checklist for Changes

Use this before merging structural changes:

1. Does every new project name match naming rules?
2. Does every new dependency edge satisfy the matrix?
3. Are cross-context imports limited to `workflows` -> other context `domain`?
4. Are cross-language source imports absent?
5. Are runtime packages free of `tooling/*` imports?
6. Were enforcement rules/tests updated with the policy change?

## Glossary

- **bounded context**: business area represented by `<context>` in package names
- **composition root**: deployable app that wires runtime dependencies and configuration
- **role**: structural layer token (`domain|workflows|infra|migrations`)
- **shared package group**: non-context package family (`lib|infra|platform`)
