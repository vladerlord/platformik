# Boundaries and dependencies (planned)

This document defines intended boundaries. Enforcement (validator) comes later.

## Cross-context rule
Bounded-context packages must depend on other contexts only via `*-contracts`.

Example:
- `py-billing-workflows` may depend on `py-org-contracts`
- `py-billing-domain` may not depend on `py-org-domain`

## Role/layer intent
- `contracts`: schemas, DTOs, interfaces
- `domain`: pure invariants and domain events/results (no infra/platform/workflows/migrations)
- `workflows`: application/orchestration (use cases); coordinates multiple domains via ports/contracts
- `infra`: technical adapters (postgres, http, temporal client wrappers)
- `migrations`: schema/migration definitions and runners; depends on DB infra only

## Shared groups
- `lib-*`: pure shared helpers
- `infra-*`: internal technical libraries
- `platform-*`: external providers (OpenAI/Anthropic/Chroma/etc.)
- `tooling-*`: repo tooling; runtime must not depend on tooling

