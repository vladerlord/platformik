# Python stack

## Dependency installation

- For Python dependencies, never guess versions manually.
- From the owning project directory, use:
  - `mise x -- uv add --bounds lower <pkg>@latest`
  - `mise x -- uv add --dev --bounds lower <pkg>@latest`

## Tooling

- `uv` for dependency management and running commands
- `ruff` for lint/format (see `configs/python/ruff.toml`)
- `pytest` for tests (see `configs/python/pytest.ini`)

## Naming

- Importable module name should be: `platformik_<dir_name_underscored>`

## Composition root

- Apps create clients and wiring (DB/Temporal/LLM/etc.)
- Packages accept dependencies via parameters (no env reads)

## Migrations

- Tool: `alembic`
- Async template: `alembic init --template async migrations`
- Driver format in DSN: `postgresql+asyncpg://...`
- Migrations run programmatically at app startup before creating DB connections
- DB query layer: SQLAlchemy Core (`Table`, `Column`, `select`, `insert`, etc.) — no ORM, no model classes
- DB driver: `asyncpg` (via `sqlalchemy[asyncio]`)
- UUID7: `uuid-utils` (`uuid_utils.uuid7()`)
