# Monorepo architecture (language-agnostic)

## `apps/` vs `packages/`
- `apps/` are deployables only (composition roots).
- `packages/` are libraries only (reusable units).

## Composition root rule
Only apps may:
- read environment variables
- create DB/queue/cache/LLM/Temporal clients
- decide runtime wiring and configuration

Packages may:
- define interfaces/ports and pure logic
- accept dependencies via constructor/function parameters
- provide adapters (infra/platform) that apps instantiate

