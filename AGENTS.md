# Agent instructions (Platformik)

## Phase: scaffolding only
Do **not** implement product runtime features unless explicitly asked.
This phase is limited to: folder structure, configs, docs, and tooling setup.

## Monorepo rules
- Only `apps/` are deployable (composition roots).
- `packages/` are libraries only (no deploy).
- Keep `packages/` flat (no nested grouping folders).
- bun package manager is used for monorepo packages

## Naming rules (strict)
See `docs/architecture/naming.md`.

## Documentation discipline
- Product docs live in `docs/product/`.
- Language-agnostic architecture docs live in `docs/architecture/`.
- Language-specific stacks live in `docs/stacks/`.
- Keep docs consistent with naming (`platformik`, `@platformik/*`, `platformik_*`).

## Tooling
- Use `mise` for installing toolchains (don’t assume system tools).
- Use Moonrepo for repo task orchestration once projects have real code.

