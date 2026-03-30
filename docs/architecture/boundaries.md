# Boundaries and Dependencies

## Purpose

This document is the architecture policy contract for source-level dependencies in the monorepo. It is
designed to be fast for humans to scan and deterministic for tooling/agents to parse.

## Scope

- Rules are language-agnostic and apply across the monorepo.
- Source-level cross-language imports are forbidden (for example, TypeScript importing Python source).

## Naming Inputs (Classification Tokens)

### Apps

- `api`: public backend entrypoint for client-facing HTTP APIs and SSE streams
- `cli`: TUI tool for testing workflows
- `web`: browser UI entrypoint
- `worker`: async/background processing entrypoint (RabbitMQ consumers, Temporal workers)

Apps own process lifecycle: they initialize and gracefully close `lib` and `sdk` resources. Apps are the
orchestration layer — they wire modules together and compose cross-module logic.

### Packages

`packages/<role>-<name>`

- `<role>`:
  - `module`:
    - self-contained business capability (bounded context)
    - owns domain model, persistence, adapters, use cases, and migrations
    - exports public API only through explicit `package.json` `exports` entry points:
      - `"."` — module runtime/factory entry point, imported only by apps for wiring
      - `"./contracts"` — public types, zod schemas, interfaces
      - optional `"./migrations"` — migration definitions only
    - all public entry points must target files inside `src/public/`
    - internal structure is implementation detail
    - modules never import other modules — cross-module composition happens in apps
  - `contracts`:
    - shared TypeScript types/`zod` schemas/interfaces for integration between `apps/*` and `module-*`
    - no domain logic, no business rules
  - `lib`:
    - shared cross-cutting technical libraries and adapters
    - may include pure utilities, infrastructure adapters, and wrappers over third-party libraries
    - examples: fp helpers, retry policies, logger adapters, postgres pool factories, fastify bootstrap
    - may wrap and re-export external libraries (e.g. `lib-fp`, `lib-pino`, `lib-fastify`, `lib-pg`)
    - no domain logic, no business rules
  - `sdk`:
    - wrappers/clients for external vendors/providers (e.g. Amazon S3, OpenAI, Anthropic, Stripe)
    - thin clients only; persistence or caching for vendor state lives inside modules
- `<name>`: namespace / ownership unit
  - business: `iam`, `billing`, `flow-store`, `chat`, `secrets`
  - cross-cutting: `fp`, `logger`, `ai` (for contracts)
  - infrastructure: `postgres`, `redis`, `pino`, `fastify`, `temporal`, `rabbitmq`

Examples:

- `packages/module-iam`
- `packages/module-flow-store`
- `packages/module-chat`
- `packages/module-secrets`
- `packages/contracts-auth`
- `packages/contracts-ai`
- `packages/lib-fp`
- `packages/lib-logger`
- `packages/sdk-openai`
- `packages/sdk-stripe`

## Module Exports Convention

Modules expose public API only via the `package.json` `exports` field:

- `"."` — module runtime/factory entry point, imported only by apps for wiring
- `"./contracts"` — public types, interfaces, and zod schemas
- optional `"./migrations"` — migration definitions only

All module public entry points must target files inside `src/public/`.

Everything outside `src/public/` is internal implementation and must not be imported from outside. Migration
execution, connection lifecycle, and DSN/env handling remain app-owned even when migration definitions are
exported by modules.

## Configs

`configs/<lang>/<config>`

- `<config>`: shared tool config files referenced from packages (via extends/include)

## Tooling

`tooling/<tool>`

- `<tool>`: repo-level scripts/CLIs that enforce or automate monorepo rules (lint, format, codegen, dep-policy
  checks)

## Dependency flow

- `app`: `lib`, `module`, `contracts`, `sdk`
- `module`: `lib`, `contracts`, `sdk`
- `contracts`: `lib`
- `lib`: `lib`
- `sdk`: `lib`

## External dependency policy

| Role        | Policy    | Detail                                                    |
| ----------- | --------- | --------------------------------------------------------- |
| `lib`       | allow_any | Shared technical code, including infrastructure adapters. |
| `module`    | allow_any | Self-contained — manages own dependencies.                |
| `contracts` | allow     | Schema/validation libraries only (e.g. zod for TS).       |
| `sdk`       | allow_any | External SDK wrappers by definition.                      |
| `app`       | allow_any | Wiring layer — unrestricted.                              |

## Enforcement Mapping

- Module internals protection (import paths):
  - `tooling/eslint/`

## Change Policy

Any boundary change must update all of the following in one change set:

1. This document (dependency flow, roles, and/or examples).
2. Related enforcement tooling configs and tests.
