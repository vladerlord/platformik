# TypeScript stack

## Dependency installation

Never guess versions. For every new dependency:

1. `pnpm view <pkg> dist-tags.latest` → get `X.Y.Z`
2. Add `<pkg>: ^X.Y.Z` to the `catalog:` section in `pnpm-workspace.yaml`
3. In every `apps/` and `packages/` manifest, set the version to `"catalog:"`

## Tooling

- `pnpm` as package manager (`pnpm-workspace.yaml` catalog for shared versions)
- `tsx` as TypeScript runtime (`tsx <file.ts>`, `tsx watch <file.ts>`)
- `vitest` as test runner
- `eslint` (root `eslint.config.mjs`)
- base TS config: `configs/typescript/tsconfig.base.json`

## Package naming

- Internal packages use scope: `@platformik/<dir-name>`
- Directory name stays the source of truth.

## Application entrypoints

All process entrypoints live in `bin/` (`migrate.ts`, `server.ts`, `seed.ts`). Each is a standalone `tsx`
script with top-level `await` — no `main()` wrapper.

- `fileGroups.sources` in `moon.yml` must include `'bin/*'`
- Migrations run explicitly (`moon run <app>:migrate`), never on server startup

## Error handling for apps without Effect-ts

- Use `neverthrow`: return `Result` or `ResultAsync` instead of throwing for expected failures.
- Do not use exceptions as an application-level error flow between packages or across app code paths.
- At the top of the call chain, use `ts-pattern` to exhaustively enumerate error variants and map them to the
  final behavior or transport response.

## Type definitions

- Keep small local types in the same file only when file contains less than 2 types or overall types lines
  count is under 10 lines.
- Treat Zod schemas as part of the type layer, even when they are local to a single module and not reused
  elsewhere. Once the type/schema layer starts to clutter the main logic, extract it to a sibling
  `<file>.types.ts` together with related inferred types. Do not create sibling `*.schemas.ts` files.

## Constants

- Top-level constants in logic files are allowed only for stable protocol or domain identifiers.
- Timing values, retry intervals, limits, thresholds, batch sizes, pagination defaults, and similar runtime
  policy values must not be declared as top-level constants in logic files.
- Runtime policy values belong in config or in explicit function or module parameters.
- Use inline literals only for trivial local values.
