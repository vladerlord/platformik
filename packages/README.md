# `packages/`

Libraries only. No deployables, no service wiring, no environment bootstrapping.

## Naming pattern

```
packages/<role>-<module>-<lang>
```

## Roles

| Role         | Semantics                                                                            |
| ------------ | ------------------------------------------------------------------------------------ |
| `lib`        | Pure technical utilities — zero IO, no external SDKs (fp, retries, resilience)       |
| `domain`     | Pure domain model — entities, value objects, domain events; no IO                    |
| `ports`      | Hexagonal port interfaces — repository, service, and capability interfaces           |
| `contracts`  | Wire-format schemas — zod/protobuf DTOs, integration event schemas                   |
| `module`     | Synchronous application services — hexagonal use cases, factory-injected             |
| `workflows`  | Business flow orchestration — technology-agnostic (Temporal, BullMQ, state machines) |
| `adapter`    | Port implementations — DB repos, queue adapters, workflow activity implementations   |
| `runtime`    | Infrastructure runtimes with lifecycle — Postgres pool, Redis, RabbitMQ, Temporal    |
| `vendor`     | External vendor wrappers — OpenAI, Anthropic, S3, Stripe                             |
| `migrations` | Domain-owned schema migrations                                                       |
| `testkit`    | Test factories, fakes, in-memory port implementations _(devDependency only)_         |

See `docs/architecture/boundaries.md` for full dependency rules and examples.
