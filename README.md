# Platformik (scaffolding)

This repository is currently **scaffolding-only** for Platformik: an educational, showcase-quality AI workflow platform for agent pipelines (Temporal-based orchestration, strict memory invariants, and a web UI).

## Current phase
- No runtime is implemented yet (no Temporal workflows, no backend endpoints, no UI features).
- This phase creates: monorepo structure, conventions, tooling configs, and documentation.

## Repo structure
- `apps/` deployables only (composition roots)
- `packages/` libraries only (flat; strict naming)
- `configs/` shared config files (eslint/tsconfig/ruff/etc.)
- `scripts/` repo tools (validators/codegen drivers later)
- `docs/` product + architecture + stacks documentation

## Tooling
- Tool installation/version pinning: `mise` (see `docs/tooling/mise.md`)
- Monorepo task orchestration: Moonrepo (see `docs/tooling/moon.md`)

## Naming quick reference
See `docs/architecture/naming.md`.
