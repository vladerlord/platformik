# TypeScript stack (planned)

## Tooling

- `bun` as runtime/package manager
- `eslint` (root `eslint.config.mjs`)
- base TS config: `configs/typescript/tsconfig.base.json`

## Package naming

- Internal packages use scope: `@platformik/<dir-name>`
- Directory name stays the source of truth.

## Error handling

- All TypeScript code in `apps/` and `packages/` should use `neverthrow`.
- Functions should return `Result` or `ResultAsync` instead of throwing exceptions for expected failures.
- Do not use exceptions as an application-level error flow between packages or across app code paths.
- At the top of the call chain, use `ts-pattern` to exhaustively enumerate the error variants and map them to
  the final behavior or transport response.
