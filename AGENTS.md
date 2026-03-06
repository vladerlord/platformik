# Agent instructions (Platformik)

## Monorepo rules

- Only `apps/` are deployable (composition roots).
- `packages/` are libraries only (no deploy).
- Keep `packages/` flat (no nested grouping folders).
- bun package manager is used for monorepo packages
- When adding or updating any dependency (including devDependencies):
  - Resolve registry latest with `bun pm view <pkg> dist-tags.latest` -> returns `X.Y.Z`
  - Install using a caret range based on that version:
    - Runtime: `bun add <pkg>@^X.Y.Z`
    - Dev: `bun add --dev <pkg>@^X.Y.Z`

## Validation loop

After making changes, always run the fix + validate loop for affected projects. `<scope>` is the
project `id` from its `moon.yml`.

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

- Product docs live in `docs/product/`.
- Language-agnostic architecture docs live in `docs/architecture/`.
- Language-specific stacks live in `docs/stacks/`.
- Keep docs consistent with naming (`platformik`, `@platformik/*`, `platformik_*`).
- Before scaffolding anything new (app, package, config, tooling), **read
  `docs/architecture/boundaries.md` first**.

## Tooling

- Use `mise` for installing toolchains (don’t assume system tools).
- Use Moonrepo for repo task orchestration once projects have real code.
