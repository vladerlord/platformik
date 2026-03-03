# Boundaries and Dependencies

## Purpose

This document is the architecture policy contract for source-level dependencies in the monorepo. It
is designed to be fast for humans to scan and deterministic for tooling/agents to parse.

## Scope

- Rules are language-agnostic and apply across the monorepo.
- Source-level cross-language imports are forbidden (for example, TypeScript importing Python
  source).
- Cross-language integration must happen via network APIs and/or language-neutral schemas/IDL +
  generated artifacts.

## Programming languages

- `<lang>`:
  - `py` - python
  - `ts` - typescript
  - `go` - golang
  - `rs` - rust
  - `kt` - kotlin
  - `sw` - swift

## Naming Inputs (Classification Tokens)

### Apps

- `apps/<client>-<module>-<lang>`
- `apps/bff-<client>-<module>-<lang>`
- `apps/service-<module>-<lang>`
- `apps/worker-<module>-<lang>`

- `<client>`:
  - `web`: browser UI entrypoint. A product may have multiple web entrypoints (e.g. microfrontends)
    and/or a host/shell app.
  - `cli`: installable client/tool (e.g. distributed via brew) that talks to a backend.
  - `android|ios|macos`: native client apps (as applicable).
- `<module>`: deployable identifier (may include qualifiers), e.g. `platform-host`,
  `platform-mf-template-gallery`.
- `bff`: backend-for-frontend for a single client app (1:1 with `<client>` + `<module>`).
- `worker`: async/background processing entrypoint.
- `service`: deployable backend entrypoint (composition/wiring of packages).

Apps own process lifecycle: they initialize and gracefully close `platform` and `provider` resources
(clients, pools, connections, workers).

Examples:

- `apps/web-platform-host-ts`
- `apps/web-platform-mf-template-gallery-ts`
- `apps/web-platform-mf-workflow-viewer-ts`
- `apps/bff-web-platform-host-ts`
- `apps/bff-web-platform-template-mf-gallery-ts`
- `apps/bff-web-platform-workflow-mf-viewer-ts`
- `apps/service-billing-rs`
- `apps/service-workflows-go`
- `apps/service-templates-ts`
- `apps/worker-workflows-ts`
- `apps/worker-billing-rs`
- `apps/cli-platform-rs`
- `apps/bff-cli-platform-ts`

### Packages

`packages/<context>-<role>-<lang>`

- `<context>`: a namespace / ownership unit
  - domain context: `billing`, `templates`, `broadcasts`, `messaging`, etc.
  - shared (cross-cutting) context: prefix with `shared-` (e.g. `shared-fp`, `shared-retries`,
    `shared-queue`, `shared-resilience`)
  - avoid ambiguous “dumping ground” contexts like `utils`, `common`, `core` (use `shared-*` with
    clear ownership instead)

- `<role>`:
  - `domain`:
    - domain invariants, entities/value objects, domain events
    - domain ports (interfaces) only; no IO
  - `workflows`:
    - application/use-case orchestration across one or more domains
    - coordinates long-running processes across resources (DBs/queues/providers) via
      sagas/outbox/compensation
    - no cross-DB ACID assumptions
  - `infra`:
    - context-specific implementations of domain ports (repositories, caches, publishers,
      workflow/activity bindings, etc.)
  - `platform`:
    - shared, instantiable infrastructure runtimes (clients/pools/connections/workers) and their
      lifecycle
    - examples: Postgres pool, Redis client, RabbitMQ connection/channel setup, Temporal
      client/worker bootstrap
  - `provider`:
    - wrappers/clients for external vendors/providers (e.g. Amazon S3, OpenAI, Anthropic)
  - `migrations`:
    - domain-owned migration sets (schema evolution) for a specific DB/schema

- `<lang>`

## Configs

`configs/<scope>/<config>`

- `<scope>`: `<lang>|tools`
- `<config>`: shared tool config files referenced from packages (via extends/include), e.g.
  `tsconfig.base.json`

## Tooling

`tooling/<tool>`

- `<tool>`: repo-level scripts/CLIs that enforce or automate monorepo rules (lint, format, codegen,
  checks)

## Dependency flow

In this section, `shared` means any `packages/shared-<context>-<role>-<lang>` package.

- `app`: `shared`, `workflows`, `infra`, `platform`, `provider`
- `domain`: `shared`
- `workflows`: `shared`, `domain`, `platform`, `provider`
- `infra`: `shared`, `domain`, `platform`, `provider`
- `platform`: `shared`
- `provider`: `shared`
- `migrations`: `shared`, `platform`
- `config`: N/A
- `tooling`: N/A

## Enforcement Mapping

- Rule wiring:
  - `tooling/eslint/typescript.boundaries.config.mjs`

## Change Policy

Any boundary change must update all of the following in one change set:

1. This document (dependency flow and, if needed, examples).
2. `tooling/eslint/typescript.boundaries.matrix.mjs`.
3. `tooling/eslint/plugin-boundaries/rules/dependency-graph.test.js`.
4. Related naming docs if classification tokens change.
