# `packages/`

Libraries only. No deployables, no service wiring, no environment bootstrapping.

## Naming (strict; flat)
`packages/<lang>-<context>-<role>`

- `<lang>`: `py|ts|go|rs`
- `<role>` (bounded-context): `contracts|domain|workflows|infra|migrations`
- `<context>`: kebab-case token created as needed

Shared/group packages:
`packages/<lang>-(lib|infra|platform|tooling)-<name>(-<subname>...)*`

See `docs/architecture/naming.md` for full rules and examples.

