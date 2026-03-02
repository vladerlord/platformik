# Boundaries and dependencies (source of truth)

This document defines intended architectural boundaries in the monorepo. Tooling
(linters/validators) should enforce these boundaries per language over time.

## Scope

- Rules are expressed in language-agnostic terms using `<lang>` and apply across the monorepo.
- Source-level dependencies across different languages are forbidden (e.g. TypeScript must not
  import Python sources). Cross-language integration happens via network APIs and/or
  language-neutral schema/IDL + generated artifacts (TBD).

## App naming (composition roots)

Apps: `apps/<role>-<service>-<lang>`

- `<role>`: `web|bff|worker|service|cli`
- `<service>`: kebab-case ownership/capability token
- `<lang>`: `py|ts|go|rs`

Examples:

- `apps/web-platform-ts`
- `apps/bff-platform-py`
- `apps/worker-orchestration-py`

## Package classification (by naming)

Bounded contexts: `packages/<lang>-<context>-<role>`

- `<lang>`: `py|ts|go|rs`
- `<context>`: kebab-case token created as needed
- `<role>`: `domain|workflows|infra|migrations`

Shared/group packages: `packages/<lang>-(lib|infra|platform)-<name>(-<subname>...)*`

## Package roles (strict architectural layers)

These roles apply to `packages/*` only: `domain|workflows|infra|migrations`.

### `domain`

Contains:

- domain logic/invariants
- domain events
- ports/interfaces (repositories, gateways, clocks, transaction managers, etc.)
- public types/schemas

Must not contain:

- orchestration/use cases
- concrete SDK/client usage (DB/HTTP/Temporal/provider SDKs)
- migrations

### `workflows` (application/orchestration layer)

Contains:

- orchestration/use cases that coordinate one or more domains
- transactional boundaries and unit-of-work coordination (including multi-DB orchestration),
  implemented via injected dependencies/ports
- workflow input/output schemas for apps

May depend on:

- one or more `<lang>-*-domain` packages (including other bounded contexts)
- `<lang>-lib-*`
- `<lang>-infra-*` (shared infrastructure primitives/wrappers)
- `<lang>-platform-*` (external providers)

Must not depend on:

- any `<lang>-*-workflows`
- any `<lang>-*-infra` (context-specific adapters)
- any `<lang>-*-migrations`
- `tooling/*` code/artifacts

### `infra` (context-specific adapters)

Contains:

- implementations of that context’s domain ports (DB repositories, queue clients, Temporal activity
  adapters, etc.)

May depend on:

- same-context `<lang>-<context>-domain`
- `<lang>-lib-*`
- `<lang>-infra-*`

Must not depend on:

- any `<lang>-platform-*`
- other bounded contexts’ packages
- `tooling/*` code/artifacts

### `migrations`

Contains:

- schema/migration definitions and runners

May depend on:

- `<lang>-infra-*` (DB/migration primitives)
- `<lang>-lib-*`

Must not depend on:

- any `<lang>-*-domain`
- any `<lang>-*-workflows`
- any `<lang>-platform-*`
- `tooling/*` code/artifacts

## Shared groups (intent)

- `<lang>-lib-*`: pure shared helpers (no IO/SDKs)
- `<lang>-infra-*`: internal technical libraries/wrappers (Postgres/Redis/Temporal/Rabbit/etc.
  primitives)
- `<lang>-platform-*`: external provider wrappers (OpenAI/Anthropic/S3/etc.)
- `tooling/*`: repo tooling; runtime code must not depend on it

## Apps are composition roots

Apps may:

- read environment variables
- create/configure clients (DB/queue/cache/LLM/Temporal/etc.)
- decide runtime wiring and configuration

Apps should:

- import `<lang>-*-workflows` (use cases) and wire their dependencies
- avoid importing `<lang>-*-domain` directly

Apps must not:

- depend on `tooling/*`

## Cross-context rule

Only `workflows` may import another bounded context, and only via that other context’s `domain`.

Examples (language-agnostic):

- ✅ `<lang>-billing-workflows` may depend on `<lang>-org-domain`
- ❌ `<lang>-billing-domain` may not depend on `<lang>-org-domain`
- ❌ `<lang>-billing-infra` may not depend on `<lang>-org-domain`

## Allowed dependencies (canonical)

The lists below describe _allowed_ dependencies by package kind within the same `<lang>` (unless
noted). Cross-language source imports are still forbidden (see scope).

### `apps/*`

May depend on:

- `<lang>-*-workflows`
- `<lang>-*-infra`
- `<lang>-lib-*`
- `<lang>-infra-*`
- `<lang>-platform-*`

Must not depend on:

- `<lang>-*-domain`
- `<lang>-*-migrations`
- `tooling/*`

### `<lang>-<ctx>-domain`

May depend on:

- `<lang>-lib-*`

Must not depend on:

- `<lang>-<any>-domain` (other contexts)
- `<lang>-<any>-workflows`
- `<lang>-<any>-infra`
- `<lang>-<any>-migrations`
- `<lang>-infra-*`
- `<lang>-platform-*`
- `tooling/*`

### `<lang>-<ctx>-workflows`

May depend on:

- `<lang>-<any>-domain` (same context and other contexts)
- `<lang>-lib-*`
- `<lang>-infra-*`
- `<lang>-platform-*`

Must not depend on:

- `<lang>-<any>-workflows`
- `<lang>-<any>-infra` (context-specific adapters)
- `<lang>-<any>-migrations`
- `tooling/*`

Note: this is the only allowed cross-context source dependency (`workflows` → other contexts’
`domain`).

### `<lang>-<ctx>-infra` (context adapters)

May depend on:

- `<lang>-<ctx>-domain` (same context only)
- `<lang>-lib-*`
- `<lang>-infra-*`

Must not depend on:

- `<lang>-platform-*`
- `<lang>-<any>-workflows`
- `<lang>-<any>-migrations`
- any other bounded-context packages (other contexts’ `domain|workflows|infra|migrations`)
- `tooling/*`

### `<lang>-<ctx>-migrations`

May depend on:

- `<lang>-infra-*`
- `<lang>-lib-*`

Must not depend on:

- bounded-context packages (`*-domain|*-workflows|*-infra|*-migrations`)
- `<lang>-platform-*`
- `tooling/*`

### `<lang>-lib-*`

May depend on:

- `<lang>-lib-*`

Must not depend on:

- bounded-context packages
- `<lang>-infra-*`
- `<lang>-platform-*`
- `tooling/*`

### `<lang>-infra-*` (shared infra primitives)

May depend on:

- `<lang>-lib-*`
- `<lang>-infra-*`

Must not depend on:

- bounded-context packages
- `<lang>-platform-*`
- `tooling/*`

### `<lang>-platform-*` (external providers)

May depend on:

- `<lang>-lib-*`
- `<lang>-infra-*`

Must not depend on:

- bounded-context packages
- `<lang>-platform-*`
- `tooling/*`
