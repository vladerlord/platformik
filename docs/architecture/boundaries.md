# Boundaries and Dependencies

## Purpose

This document is the architecture policy contract for source-level dependencies in the monorepo. It
is designed to be fast for humans to scan and deterministic for tooling/agents to parse.

## Scope

- Rules are language-agnostic and apply across the monorepo.
- Source-level cross-language imports are forbidden (for example, TypeScript importing Python
  source).
- Cross-language integration must happen via network APIs (HTTP/gRPC) and/or language-neutral
  schemas/IDL + generated artifacts.

## Programming languages and schemas

- `<lang>`:
  - `ts` - TypeScript
  - `py` - Python
  - `go` - Go
  - `rs` - Rust
  - `kt` - Kotlin
  - `sw` - Swift
- `<schema>`:
  - `proto` - Protocol Buffers
  - `jsonschema` - JSON Schema

A package uses either `<lang>` (executable code) or `<schema>` (codegen source of truth), never
both. `<lang>` packages have runtime dependencies, tests, and build steps. `<schema>` packages
contain only schema files and codegen configuration.

## Naming Inputs (Classification Tokens)

### Apps

- `apps/<client>-<name>-<lang>`
- `apps/bff-<client>-<name>-<lang>`
- `apps/service-<name>-<lang>`
- `apps/worker-<name>-<lang>`

- `<client>`:
  - `web`: browser UI entrypoint
  - `cli`: installable client/tool that talks to a backend
  - `android|ios|macos`: native client apps
- `<name>`: deployable identifier (may include qualifiers)
- `bff`: backend-for-frontend for a single client app (1:1 with `<client>` + `<name>`)
- `worker`: async/background processing entrypoint (RabbitMQ consumers, Temporal workers)
- `service`: deployable backend entrypoint (HTTP/gRPC server)

Apps own process lifecycle: they initialize and gracefully close `runtime` and `vendor` resources.
Apps are the orchestration layer — they wire modules together and compose cross-module logic.

Examples:

- `apps/web-platform-ts`
- `apps/bff-web-platform-ts`
- `apps/bff-cli-platform-ts`
- `apps/service-api-ts`
- `apps/service-ai-py`
- `apps/worker-flow-runner-ts`
- `apps/worker-events-ts`
- `apps/cli-agent-rs`

### Packages

`packages/<role>-<name>-<lang|schema>`

- `<role>`:
  - `module`:
    - self-contained business capability (bounded context)
    - owns domain model, persistence, adapters, use cases, migrations internally — none of these are
      exported
    - exports only: public contracts (types, schemas, interfaces) via `./contracts` subpath and a
      module factory function via `.` main entry
    - internal structure is at the author's discretion: simple modules may be flat, complex modules
      may use ports/adapters/domain layers internally
    - modules never import other modules — cross-module composition happens in apps
  - `contracts`:
    - shared cross-boundary schemas not owned by any single module
    - `<lang>` variant: executable schemas (e.g. zod DTOs shared between BFF and web client)
    - `<schema>` variant: language-neutral IDL for codegen (e.g. protobuf for gRPC); contains only
      schema files — generated code goes into `<lang>` packages
    - no domain logic, no business rules
  - `lib`:
    - pure cross-cutting technical utilities; zero IO
    - external dependencies limited to pure computational libraries (no IO, no SDKs)
    - examples: fp helpers (neverthrow wrappers), retry policies, Result type combinators
    - may wrap and re-export pure external libraries (e.g. `lib-fp-ts` wraps `neverthrow`)
    - NOT for business domain types (those belong inside modules)
  - `runtime`:
    - instantiable infrastructure runtimes and their lifecycle management (start/stop)
    - examples: Postgres pool, Redis client, RabbitMQ connection, Temporal worker/client bootstrap,
      Pino logger, Fastify server
    - shared infrastructure — not owned by any business module
  - `vendor`:
    - wrappers/clients for external vendors/providers (e.g. Amazon S3, OpenAI, Anthropic, Stripe)
    - thin clients only; persistence or caching for vendor state lives inside modules
- `<name>`: namespace / ownership unit
  - business: `iam`, `billing`, `flow-store`, `chat`, `secrets`
  - cross-cutting: `fp`, `logger`, `ai` (for contracts)
  - infrastructure: `postgres`, `redis`, `pino`, `fastify`, `temporal`, `rabbitmq`
- `<lang|schema>`

Examples:

- `packages/module-iam-ts`
- `packages/module-flow-store-ts`
- `packages/module-chat-ts`
- `packages/module-secrets-ts`
- `packages/contracts-platform-api-ts`
- `packages/contracts-cli-api-ts`
- `packages/contracts-ai-proto`
- `packages/contracts-ai-ts`
- `packages/lib-fp-ts`
- `packages/lib-logger-ts`
- `packages/runtime-postgres-ts`
- `packages/runtime-pino-ts`
- `packages/runtime-fastify-ts`
- `packages/runtime-temporal-ts`
- `packages/runtime-rabbitmq-ts`
- `packages/runtime-redis-ts`
- `packages/vendor-openai-ts`
- `packages/vendor-stripe-ts`

## Module Exports Convention

Modules expose exactly two public entry points via `package.json` `exports` field:

- `"."` → `src/module.ts` — factory function, imported only by apps for wiring
- `"./contracts"` → `src/contracts.ts` — public types, interfaces, zod schemas

Everything else inside `src/` is internal implementation and must not be imported from outside.

## Codegen (proto → lang)

`<schema>` packages are inputs to codegen tooling. Generated artifacts are committed to the
repository and land in `<lang>` packages. CI verifies generated code is up to date:

```text
packages/contracts-ai-proto/             → source .proto files
    ↓ tooling/codegen-proto
packages/contracts-ai-ts/src/generated/  → generated TS gRPC client types
apps/service-ai-py/src/generated/        → generated Python gRPC server stubs
```

## Configs

`configs/<scope>/<config>`

- `<scope>`: `<lang>|tools`
- `<config>`: shared tool config files referenced from packages (via extends/include)

## Tooling

`tooling/<tool>`

- `<tool>`: repo-level scripts/CLIs that enforce or automate monorepo rules (lint, format, codegen,
  dep-policy checks)

## Dependency flow

- `app`: `lib`, `module`, `contracts`, `runtime`, `vendor`
- `module`: `lib`, `runtime`, `vendor`
- `contracts`: `lib`
- `lib`: `lib`
- `runtime`: `lib`
- `vendor`: `lib`

Schema packages (`proto`, `jsonschema`) do not participate in the runtime dependency graph. They are
inputs to codegen tooling only.

## Architectural Conventions

- **Module isolation**: Modules never import other modules. Cross-module composition happens
  exclusively in apps via dependency injection.
- **Module internals protection**: Outside consumers may only import from a module's `"."` and
  `"./contracts"` exports. Direct imports of internal paths (e.g. `module-iam-ts/src/adapters/...`)
  are forbidden. Enforced by ESLint at the source-code level.
- **Shared contracts scope**: `contracts` packages exist for cross-boundary schemas that are not
  owned by any single module (e.g. REST API schemas shared between BFF and web client, or protobuf
  definitions for cross-language gRPC).
- **Cross-language boundary**: TypeScript and Python communicate via gRPC (with streaming support).
  Rust CLI communicates with BFF via HTTP. No source-level imports across languages.

## External dependency policy

| Role        | Policy    | Detail                                              |
| ----------- | --------- | --------------------------------------------------- |
| `lib`       | allow     | Pure computational libraries only (no IO, no SDKs). |
| `module`    | allow_any | Self-contained — manages own dependencies.          |
| `contracts` | allow     | Schema/validation libraries only (e.g. zod for TS). |
| `runtime`   | allow_any | Infrastructure clients by definition.               |
| `vendor`    | allow_any | External SDK wrappers by definition.                |
| `app`       | allow_any | Wiring layer — unrestricted.                        |

Allowed package lists for `lib` and `contracts` are maintained in `tooling/dep-policy/policy.yaml`.

Enforcement: `tooling/dep-policy/`

## Enforcement Mapping

- Dependency flow + external dependency policy:
  - `tooling/dep-policy/policy.yaml`
- Module internals protection (import paths):
  - `tooling/eslint/`

## Change Policy

Any boundary change must update all of the following in one change set:

1. This document (dependency flow, roles, and/or examples).
2. `tooling/dep-policy/policy.yaml`.
3. Related enforcement tooling configs and tests.
