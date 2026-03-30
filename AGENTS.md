# Agent instructions (Platformik)

## Monorepo Rules

- **Task Runner:** Use `moon run <target>` for all tasks. Never run scripts directly via pnpm.
- **Environment:** Use `mise run` or `mise exec --` to ensure tools and env vars are loaded from `.mise.toml`.
- **Package Manager:** Use `pnpm`. Never use npm, bun, or npx (use `pnpm exec` instead).
- **Runtime:** Use `tsx` for running TypeScript files directly (`tsx <file.ts>`).

## Validation loop

After making changes, always run the fix + validate loop for affected projects. `<scope>` is the project `id`
from its `moon.yml`.

```bash
moon run <scope>:fix          # lint-fix + format-fix
moon run <scope>:validate     # typecheck + lint + format + test
```

For content files (md, yml, yaml, json) changed anywhere in the repo:

```bash
moon run tooling-content:format-fix
moon run tooling-content:validate
```

## Documentation discipline

- Language-agnostic architecture docs live in `docs/architecture/`.
- Before planning or writing code, **read `docs/architecture/boundaries.md` and
  `docs/stacks/coding-principles.md` first**.
- Before planning or writing code in `apps/` or `packages/`, read `docs/stacks/typescript.md` first.
- Keep docs consistent with naming (`platformik`, `@platformik/*`).

## Tooling

- Use `mise` for installing toolchains (don't assume system tools).
- Use Moonrepo for repo task orchestration once projects have real code.
