# Python stack (planned)

## Tooling

- `uv` for dependency management and running commands
- `ruff` for lint/format (see `configs/python/ruff.toml`)
- `pytest` for tests (see `configs/python/pytest.ini`)

## Naming

- Python packages are `packages/py-*`
- Importable module name should be: `platformik_<dir_name_underscored>`

## Composition root

- Apps create clients and wiring (DB/Temporal/LLM/etc.)
- Packages accept dependencies via parameters (no env reads)
