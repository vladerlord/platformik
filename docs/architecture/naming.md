# Naming conventions (strict)

## `packages/` (flat)
Bounded contexts:
`packages/<lang>-<context>-<role>`

- `<lang>`: `py|ts|go|rs`
- `<context>`: kebab-case token created as needed
- `<role>`: `contracts|domain|workflows|infra|migrations`

Shared/group packages:
`packages/<lang>-(lib|infra|platform|tooling)-<name>(-<subname>...)*`

Reserved shared prefixes (must not be used as `<context>`):
`lib|infra|platform|tooling`

Examples:
- `packages/py-messaging-domain`
- `packages/py-billing-migrations`
- `packages/py-platform-openai`
- `packages/py-infra-postgres`
- `packages/ts-lib-logger`

## `apps/`
`apps/<kind>-<target>(-<runtime>)?`

- `<kind>`: `bff|worker|spa|cli`
- `<runtime>`: `py|ts|go|rs`

Rules:
- `apps/worker-*` must include runtime suffix.
- Python deployables must end with `-py`.

Examples:
- `apps/bff-web-py`
- `apps/worker-temporal-py`
- `apps/spa-web`

