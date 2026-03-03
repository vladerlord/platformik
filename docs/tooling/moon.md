# Moonrepo (monorepo task runner)

Moonrepo will orchestrate tasks across `apps/*` and `packages/*` (polyglot).

## Intended usage (once code exists)

- Workspace tasks like `:lint`, `:format`, `:typecheck`, `:check`
- Per-project tasks for apps/packages (e.g. Python via `uv`, TS via `bun`)

## Current state

Scaffolding only: configs are present but tasks may be placeholders until projects have code.
