# Platformik Monorepo — Architecture Memory

## Package Naming Convention

`packages/<role>-<module>-<lang>` (role-first, enforced by ESLint)

| Role        | Semantics                                                                                    |
| ----------- | -------------------------------------------------------------------------------------------- |
| `module`    | Self-contained business capability; exports only `"."` (factory) and `"./contracts"` (types) |
| `contracts` | Shared cross-boundary schemas not owned by any single module                                 |
| `lib`       | Pure cross-cutting technical utilities; zero IO                                              |
| `runtime`   | Instantiable infrastructure runtimes (Postgres, Redis, RabbitMQ, etc.)                       |
| `vendor`    | Wrappers/clients for external vendors (OpenAI, Stripe, S3, etc.)                             |

App naming (from `docs/architecture/boundaries.md`):

- `apps/<client>-<name>-<lang>` e.g. `apps/web-platform-ts` (browser SPA)
- `apps/bff-<client>-<name>-<lang>` e.g. `apps/bff-web-platform-ts`
- `apps/service-<name>-<lang>`, `apps/worker-<name>-<lang>`
- `<client>`: `web` | `cli` | `android` | `ios` | `macos`

## Key Design Decisions

- **Module exports**: only `"."` (factory function, imported by apps) and `"./contracts"`
  (types/schemas)
- **Module isolation**: modules never import other modules — cross-module composition in apps only
- **Dependency flow**: `app → lib, module, contracts, runtime, vendor` |
  `module → lib, runtime, vendor` | `contracts → lib` | `lib → lib` | `runtime → lib` |
  `vendor → lib`
- **Cross-language**: TypeScript ↔ Python via gRPC only. No source-level cross-language imports.
- **Dependency injection**: Apps create runtime connections and inject them into module/adapter
  factories.

## Enforcement Tooling

ESLint enforces **module boundary protection** only (dependency flow moved to
`tooling/dep-policy/`).

- `tooling/eslint/plugin-module-boundaries/index.ts` — plugin entry
- `tooling/eslint/plugin-module-boundaries/rules/no-internal-imports.ts` — blocks
  `@platformik/module-iam-ts/src/...`
- `tooling/eslint/plugin-module-boundaries/rules/no-cross-package-relative.ts` — blocks
  `../../other-pkg/src/...`
- `tooling/eslint/base.config.mjs` — ESLint flat config with both rules
- `eslint.config.mjs` — root config, re-exports `base.config.mjs`

Rule options (in `base.config.mjs`):

- `no-internal-imports`: `{ monorepoScope: '@platformik', allowedSubpaths: ['contracts'] }`
- `no-cross-package-relative`: no options (uses `existsSync` to walk up to `package.json`)

## Change Policy (from boundaries.md)

Any boundary change requires updating in ONE changeset:

1. `docs/architecture/boundaries.md`
2. `tooling/dep-policy/policy.yaml`
3. Related enforcement tooling configs and tests

## SvelteKit + Module Federation Notes

- Use `@originjs/vite-plugin-federation` (NOT `@module-federation/vite` — has CJS/ESM bug in
  dts-plugin)
- Pin `vite` to `^6.4.1` — federation plugin breaks with Vite 7's stricter ESM loading
- Set `shared: {}` (empty) until remotes are configured — `shared: ['svelte']` causes SSR build
  failures in SvelteKit because it transforms all svelte imports through federation virtual modules
- SvelteKit app `tsconfig.json` uses TS5 array extends:
  `[".svelte-kit/tsconfig.json", "../../configs/typescript/tsconfig.svelte.json"]` — `.svelte-kit`
  provides lib/DOM/paths; `tsconfig.svelte.json` provides strictness + skipLibCheck
- `svelte-check` is the typecheck tool (not `tsc`) — override the moon task
- Run `bunx svelte-kit sync` before `svelte-check` to generate `.svelte-kit/tsconfig.json`

## Test Commands

```bash
bun test                                                          # full suite
bun test tooling/eslint/plugin-module-boundaries/__tests__/      # ESLint rules only
```
