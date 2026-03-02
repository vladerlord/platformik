# Naming conventions (strict)

## `packages/` (flat)
Bounded contexts:
`packages/<lang>-<context>-<role>`

- `<lang>`: `py|ts|go|rs`
- `<context>`: kebab-case token created as needed
- `<role>`: `domain|workflows|infra|migrations`

Shared/group packages:
`packages/<lang>-(lib|infra|platform)-<name>(-<subname>...)*`

Reserved shared prefixes (must not be used as `<context>`):
`lib|infra|platform`

Examples:
- `packages/py-messaging-domain`
- `packages/py-billing-migrations`
- `packages/py-platform-openai`
- `packages/py-infra-postgres`
- `packages/ts-lib-logger`

## `tooling/`

Repo tooling must live under `tooling/`, not `packages/`.

## `apps/`
`apps/<role>-<service>-<lang>`

- `<role>`: `web|bff|worker|service|cli`
- `<service>`: kebab-case ownership/capability token
- `<lang>`: `py|ts|go|rs`

Rules:
- `<lang>` is required for all apps.
- Python deployables must end with `-py`.

Examples:
- `apps/web-platform-ts`
- `apps/bff-platform-py`
- `apps/worker-orchestration-py`
- `apps/service-templates-go`
- `apps/cli-platform-rs`
