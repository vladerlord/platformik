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

Apps own process lifecycle: they initialize and gracefully close `runtime` and `vendor` resources
(clients, pools, connections, workers).

Examples:

- `apps/web-platform-host-ts`
- `apps/web-platform-mf-template-gallery-ts`
- `apps/web-platform-mf-workflow-viewer-ts`
- `apps/bff-web-platform-host-ts`
- `apps/bff-web-platform-template-mf-gallery-ts`
- `apps/bff-web-platform-workflow-mf-viewer-ts`
- `apps/service-billing-rs`
- `apps/service-orchestration-go`
- `apps/service-templates-ts`
- `apps/worker-checkout-ts`
- `apps/worker-billing-rs`
- `apps/cli-platform-rs`
- `apps/bff-cli-platform-ts`

### Packages

`packages/<role>-<module>-<lang>`

- `<role>`:
  - `lib`:
    - pure cross-cutting **technical** utilities; zero IO, no external SDK dependencies
    - examples: fp helpers, retry policies, resilience patterns, queue abstractions
    - NOT for business domain types (use `domain` packages with generic module names instead)
  - `domain`:
    - pure domain model: entities, value objects, domain events
    - no port interfaces, no IO
    - shared cross-cutting business primitives (Money, UserId, DateRange) go in dedicated `domain`
      packages with generic module names (e.g. `domain-identity-ts`, `domain-money-ts`) and are
      importable by any context by convention
  - `ports`:
    - hexagonal port interfaces for a bounded context; references domain entity types in method
      signatures
    - includes both infra-facing ports (IRepository, IEventPublisher) and capability-facing ports
      (IActivityService, ICapabilityGateway)
    - no implementations, no IO
  - `contracts`:
    - wire-format schemas: zod/protobuf request/response DTOs, integration event schemas
    - the published language for cross-context integration via APIs and events
    - no domain logic, no port interfaces
  - `module`:
    - synchronous application services / hexagonal use cases for one bounded context
    - wired via factory functions at app startup — receives port implementations as injected
      dependencies; never creates connections directly
    - may import its own context's `contracts` to construct and publish typed integration events
  - `workflows`:
    - technology-agnostic business flow orchestration (Temporal, BullMQ, state machines, sagas,
      etc.)
    - the role does not encode the engine; `workflows-checkout-ts` may use any engine depending on
      cost and complexity of the flow
    - imports `runtime` for the orchestration engine (Temporal client, BullMQ connection) that is
      injected at the app level
    - if a single flow later needs two engine variants, use `workflows-<flow>-temporal-ts` /
      `workflows-<flow>-bullmq-ts` at that point
    - invokes cross-context capability interfaces from any context's `ports`
  - `adapter`:
    - context-specific domain port implementations: DB repositories, queue publishers/consumers,
      workflow activity implementations
    - same bounded context as the ports it implements (convention, not enforced by tooling)
  - `runtime`:
    - instantiable infrastructure runtimes and their lifecycle management (start/stop)
    - examples: Postgres pool, Redis client, RabbitMQ connection/channel setup, Temporal
      worker/client bootstrap
    - always cross-cutting — never context-specific
  - `vendor`:
    - wrappers/clients for external vendors/providers (e.g. Amazon S3, OpenAI, Anthropic, Stripe)
    - thin clients only; persistence or caching for vendor state lives in `adapter`
  - `migrations`:
    - domain-owned migration sets (schema evolution) for a specific DB/schema
    - independent of domain code intentionally — schema evolves without importing domain types
  - `testkit`:
    - test factories, fakes, in-memory port implementations, module test doubles
    - devDependency only; never deployed to production
- `<module>`: a namespace / ownership unit
  - domain context: `billing`, `templates`, `broadcasts`, `messaging`, etc.
  - cross-cutting: `fp`, `retries`, `resilience`, `identity`, `money`
- `<lang>`

Examples:

- `packages/domain-billing-ts`
- `packages/domain-identity-ts`
- `packages/ports-billing-ts`
- `packages/contracts-billing-ts`
- `packages/module-billing-ts`
- `packages/workflows-checkout-ts`
- `packages/adapter-billing-ts`
- `packages/runtime-postgres-ts`
- `packages/runtime-temporal-ts`
- `packages/vendor-openai-ts`
- `packages/migrations-billing-ts`
- `packages/lib-fp-ts`
- `packages/lib-retries-ts`

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

- `app`: `lib`, `domain`, `ports`, `contracts`, `module`, `workflows`, `adapter`, `runtime`,
  `vendor`
- `lib`: `lib`
- `domain`: `lib`
- `ports`: `lib`, `domain`
- `contracts`: `lib`
- `module`: `lib`, `domain`, `ports`, `contracts`
- `workflows`: `lib`, `ports`, `contracts`, `runtime`
- `adapter`: `lib`, `domain`, `ports`, `runtime`, `vendor`
- `runtime`: `lib`
- `vendor`: `lib`
- `migrations`: `lib`, `runtime`
- `testkit`: `lib`, `domain`, `ports`, `module`
- `config`: N/A
- `tooling`: N/A

## Architectural Conventions

The following rules are enforced by code review and architecture documentation, not by the ESLint
boundary rule (which operates at role-level only):

- **Context isolation for `module` and `adapter`**: These packages represent a single bounded
  context. They should only use their own context's `domain` and `ports`. Cross-context integration
  must go through `contracts` (integration events/commands) or through dependency injection wired at
  the app level.
- **`module` and own-context `contracts`**: A `module` may import its own context's `contracts` to
  construct and publish typed integration events (e.g. `module-billing-ts` imports
  `contracts-billing-ts` to build an `InvoiceCreatedEvent`). Importing another context's `contracts`
  is forbidden — use that context's `ports` instead.
- **Shared business domain types**: Place cross-cutting business primitives (Money, UserId,
  DateRange) in dedicated `domain-*` packages with generic module names (e.g. `domain-identity-ts`,
  `domain-money-ts`). These may be imported by any bounded context by convention.
- **`workflows` and cross-context ports**: `workflows` packages may invoke capability interfaces
  from any context's `ports` — cross-context orchestration is their primary purpose.

## Enforcement Mapping

- Rule wiring:
  - `tooling/eslint/typescript.boundaries.config.mjs`

## Change Policy

Any boundary change must update all of the following in one change set:

1. This document (dependency flow and, if needed, examples).
2. `tooling/eslint/typescript.boundaries.matrix.mjs`.
3. `tooling/eslint/plugin-boundaries/core/constants.js`.
4. `tooling/eslint/plugin-boundaries/rules/dependency-graph.test.js`.
5. Related naming docs if classification tokens change.
