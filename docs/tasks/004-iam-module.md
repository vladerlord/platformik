# Task: Implement `packages/module-iam-ts` — Identity & Access Management Module

## Context

The platform needs tenant authentication (sign-up, sign-in, sessions) and storage for third-party
provider API keys (OpenAI, Anthropic — BYOK model). This module uses
[BetterAuth](https://better-auth.com/) as the auth engine and exposes a public API consumed by the
BFF composition root.

### Key architectural decisions (already made)

- **BYOK for AI**: tenants supply their own provider API keys, stored encrypted in the IAM database.
- **Provider API keys live in IAM**, not in a separate secrets module — they are tenant-level
  credentials.
- **Temporal workers** will later retrieve keys via gRPC from `apps/service-iam-ts`, but that
  promotion is out of scope for this task.
- **BetterAuth + Kysely + PostgreSQL** is the stack for this module.

### Integration question resolved

BetterAuth works as a request handler — it owns a set of HTTP routes (`/api/auth/*`). The module
cannot register routes on Fastify directly (modules don't know about Fastify). Instead:

- The module exports a **handler** (BetterAuth's `auth.handler`) and a **programmatic API**
  (`auth.api`).
- The BFF creates a Fastify catch-all route and delegates to the module's handler.
- This keeps the module framework-agnostic while giving the BFF full control over route mounting.

## Goal

Create `packages/module-iam-ts` that:

1. Wraps BetterAuth with PostgreSQL/Kysely adapter.
2. Manages its own database schema via Kysely migrations (BetterAuth core tables + custom tables).
3. Exports a factory function returning a handler and programmatic API.
4. Provides CRUD for encrypted third-party provider API keys.
5. Integrates into `apps/bff-web-platform-ts` as a composition-root consumer.

## Tech Stack

- **Auth engine**: `better-auth` (latest)
- **Database**: PostgreSQL (separate database: `platformik_iam`)
- **Query builder**: `kysely` (BetterAuth's built-in adapter)
- **Encryption**: Node.js `crypto` (AES-256-GCM for API key encryption)
- **Validation**: `zod` (for contracts)
- **Test runner**: `bun test`

## Database Schema

### BetterAuth core tables (managed by BetterAuth migrations)

BetterAuth creates and manages these tables automatically:

- `user` — id, name, email, emailVerified, image, createdAt, updatedAt
- `session` — id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt
- `account` — id, userId, accountId, providerId, accessToken, refreshToken, password, ...
- `verification` — id, identifier, value, expiresAt, createdAt, updatedAt

### Custom tables (managed by Kysely migrations in this module)

#### `provider_api_key`

Stores encrypted third-party API keys per tenant (user).

| Column          | Type         | Notes                                        |
| --------------- | ------------ | -------------------------------------------- |
| `id`            | `text`       | Primary key (nanoid/cuid)                    |
| `user_id`       | `text`       | FK → `user.id`, ON DELETE CASCADE            |
| `provider`      | `text`       | e.g. `openai`, `anthropic`, `google`         |
| `encrypted_key` | `text`       | AES-256-GCM encrypted API key                |
| `iv`            | `text`       | Initialization vector for decryption         |
| `auth_tag`      | `text`       | GCM authentication tag                       |
| `label`         | `text`       | Optional user-facing label ("My OpenAI key") |
| `created_at`    | `timestampt` | Default `now()`                              |
| `updated_at`    | `timestampt` | Default `now()`                              |

Unique constraint: `(user_id, provider)` — one key per provider per tenant.

## Architecture / File Structure

```
packages/module-iam-ts/
├── src/
│   ├── index.ts                  # Public export: createIamModule factory
│   ├── contracts.ts              # Public types: IamModule, ProviderApiKey, etc.
│   ├── auth.ts                   # BetterAuth instance factory
│   ├── provider-api-key/
│   │   ├── repository.ts         # DB queries for provider_api_key table
│   │   ├── encryption.ts         # AES-256-GCM encrypt/decrypt helpers
│   │   └── service.ts            # Business logic: CRUD with encryption
│   └── migrations/
│       ├── index.ts              # Migration runner (Kysely Migrator)
│       └── 001-provider-api-key.ts  # Create provider_api_key table
├── __tests__/
│   ├── auth.test.ts              # BetterAuth instance creation
│   ├── provider-api-key/
│   │   ├── encryption.test.ts    # Encrypt/decrypt round-trip
│   │   ├── repository.test.ts    # DB queries (needs test DB)
│   │   └── service.test.ts       # Business logic with mocked repo
│   └── integration.test.ts       # Full module creation + auth flow
├── package.json
└── tsconfig.json
```

## Module Responsibilities

### `contracts.ts` (exported via `"./contracts"`)

Public types and schemas — no implementation, no IO.

```ts
import { z } from 'zod'

// Provider enum
export const providerSchema = z.enum(['openai', 'anthropic', 'google'])
export type Provider = z.infer<typeof providerSchema>

// What the BFF/consumer sees (never includes the raw key)
export type ProviderApiKeyInfo = {
  id: string
  userId: string
  provider: Provider
  label: string | null
  createdAt: Date
  updatedAt: Date
}

// Input for creating/updating a key
export type SetProviderApiKeyInput = {
  userId: string
  provider: Provider
  apiKey: string // plaintext — module encrypts before storage
  label?: string
}

// The full module API surface
export type IamModule = {
  /** BetterAuth request handler — pass to your HTTP framework's catch-all route */
  handler: (request: Request) => Promise<Response>
  /** Programmatic auth API (getSession, etc.) */
  auth: {
    getSession: (opts: { headers: Headers }) => Promise<SessionResult | null>
  }
  /** Provider API key management */
  providerApiKeys: {
    set: (input: SetProviderApiKeyInput) => Promise<ProviderApiKeyInfo>
    get: (userId: string, provider: Provider) => Promise<ProviderApiKeyInfo | null>
    getDecrypted: (userId: string, provider: Provider) => Promise<string | null>
    list: (userId: string) => Promise<ProviderApiKeyInfo[]>
    delete: (userId: string, provider: Provider) => Promise<void>
  }
  /** Run pending Kysely migrations for custom tables */
  migrate: () => Promise<void>
}

export type IamModuleConfig = {
  /** PostgreSQL connection string for the IAM database */
  dsn: string
  /** Base URL for auth routes (e.g. "http://localhost:3000") */
  baseUrl: string
  /** Secret for BetterAuth (session signing, etc.) */
  authSecret: string
  /** 32-byte hex string for AES-256-GCM encryption of provider API keys */
  encryptionKey: string
  /** Trusted origins for CORS */
  trustedOrigins?: string[]
}
```

### `auth.ts`

Creates the BetterAuth instance. Internal to the module — not exported.

- Accepts a `pg.Pool` and config.
- Passes the pool to BetterAuth's database option.
- Returns the `auth` object with `handler` and `api`.

```ts
import { betterAuth } from 'better-auth'
import type { Pool } from 'pg'

export const createAuth = (
  pool: Pool,
  config: { baseUrl: string; secret: string; trustedOrigins?: string[] },
) =>
  betterAuth({
    database: pool,
    baseURL: config.baseUrl,
    secret: config.secret,
    trustedOrigins: config.trustedOrigins,
    emailAndPassword: { enabled: true },
  })
```

### `provider-api-key/encryption.ts`

Pure functions for AES-256-GCM encrypt/decrypt. No IO.

- `encrypt(plaintext: string, keyHex: string): { encrypted: string; iv: string; authTag: string }`
- `decrypt(encrypted: string, iv: string, authTag: string, keyHex: string): string`
- Uses `node:crypto` — `createCipheriv` / `createDecipheriv`.
- Random IV per encryption call.

### `provider-api-key/repository.ts`

Kysely-based database queries for the `provider_api_key` table.

- `upsert(row)` — INSERT ON CONFLICT (user_id, provider) DO UPDATE
- `findByUserAndProvider(userId, provider)` — single row lookup
- `findAllByUser(userId)` — list all keys for a user
- `deleteByUserAndProvider(userId, provider)` — hard delete

Takes a Kysely instance as a constructor/factory argument.

### `provider-api-key/service.ts`

Orchestrates encryption + repository. Implements the `providerApiKeys` interface from contracts.

- `set()` → encrypts the plaintext key, calls `repository.upsert()`.
- `get()` → calls `repository.find()`, returns info without the encrypted data.
- `getDecrypted()` → calls `repository.find()`, decrypts, returns plaintext key.
- `list()` → returns all keys for a user (metadata only).
- `delete()` → calls `repository.delete()`.

### `migrations/001-provider-api-key.ts`

Kysely migration for the `provider_api_key` table.

```ts
import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('provider_api_key')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('user_id', 'text', (col) => col.notNull().references('user.id').onDelete('cascade'))
    .addColumn('provider', 'text', (col) => col.notNull())
    .addColumn('encrypted_key', 'text', (col) => col.notNull())
    .addColumn('iv', 'text', (col) => col.notNull())
    .addColumn('auth_tag', 'text', (col) => col.notNull())
    .addColumn('label', 'text')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo('now()'))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo('now()'))
    .addUniqueConstraint('uq_provider_api_key_user_provider', ['user_id', 'provider'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('provider_api_key').execute()
}
```

### `migrations/index.ts`

Runs Kysely migrations for custom tables only. BetterAuth manages its own tables separately via
`npx auth@latest migrate`.

```ts
import { Migrator, FileMigrationProvider } from 'kysely'
// Registers migration files and runs pending ones
```

### `index.ts` (main export)

Factory function that wires everything together.

```ts
import type { IamModule, IamModuleConfig } from './contracts'

export const createIamModule = async (config: IamModuleConfig): Promise<IamModule> => {
  // 1. Create pg.Pool from config.dsn
  // 2. Create Kysely instance from pool
  // 3. Create BetterAuth instance
  // 4. Create provider API key repository + service
  // 5. Return IamModule interface
}
```

Note: the factory is `async` to allow optional auto-migration on startup (controlled by config).

## BFF Integration

### `apps/bff-web-platform-ts/src/container.ts`

```ts
import { createIamModule } from '@platformik/module-iam-ts'
import type { IamModule } from '@platformik/module-iam-ts/contracts'

export type AppContainer = {
  server: FastifyInstance
  logger: Logger
  iam: IamModule
}

export const buildContainer = async (): Promise<AppContainer> => {
  const logger = createPinoLogger({ level: 'info', name: 'bff-web-platform' })
  const server = createFastifyServer({ logger })

  const iam = await createIamModule({
    dsn: process.env['IAM_DATABASE_URL']!,
    baseUrl: process.env['AUTH_BASE_URL'] ?? 'http://localhost:3000',
    authSecret: process.env['AUTH_SECRET']!,
    encryptionKey: process.env['ENCRYPTION_KEY']!,
    trustedOrigins: [process.env['CLIENT_ORIGIN'] ?? 'http://localhost:5173'],
  })

  return { server, logger, iam }
}
```

### `apps/bff-web-platform-ts/src/routes/auth.ts`

Registers BetterAuth catch-all route on Fastify. The BFF owns this glue code, not the module.

```ts
import type { FastifyInstance } from 'fastify'
import type { IamModule } from '@platformik/module-iam-ts/contracts'

export const registerAuthRoutes = (server: FastifyInstance, iam: IamModule) => {
  server.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      const url = new URL(request.url, `http://${request.headers.host}`)
      const headers = new Headers()
      Object.entries(request.headers).forEach(([key, value]) => {
        if (value) headers.append(key, String(value))
      })

      const req = new Request(url.toString(), {
        method: request.method,
        headers,
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      })

      const response = await iam.handler(req)

      reply.status(response.status)
      response.headers.forEach((value, key) => reply.header(key, value))
      reply.send(response.body ? await response.text() : null)
    },
  })
}
```

### `apps/bff-web-platform-ts/src/routes/provider-api-keys.ts`

REST endpoints for managing provider API keys (settings page).

```
PUT    /api/provider-keys/:provider   — set/update a key
GET    /api/provider-keys             — list all keys (metadata only)
DELETE /api/provider-keys/:provider   — delete a key
```

Each route: extract session via `iam.auth.getSession()`, then call `iam.providerApiKeys.*`.

## Implementation Steps

### Step 1: Scaffold the package

- Create `packages/module-iam-ts/` with `package.json`, `tsconfig.json`.
- Add dependencies: `better-auth`, `pg`, `kysely`, `zod`, `nanoid` (or use `crypto.randomUUID`).
- Configure package exports: `"."` → `src/index.ts`, `"./contracts"` → `src/contracts.ts`.
- Wire into the monorepo workspace.

### Step 2: Implement contracts

- Write `contracts.ts` with all public types and Zod schemas.
- No implementation — types only.

### Step 3: Implement encryption helpers

- Write `provider-api-key/encryption.ts`.
- Write `__tests__/provider-api-key/encryption.test.ts` — round-trip encrypt/decrypt, different IVs
  per call, invalid key rejection.

### Step 4: Implement BetterAuth wrapper

- Write `auth.ts` — thin wrapper around `betterAuth()`.
- Configure `emailAndPassword: { enabled: true }` for sign-up/sign-in.

### Step 5: Implement provider API key repository

- Write `provider-api-key/repository.ts` — Kysely queries.
- Write tests (requires test database).

### Step 6: Implement provider API key service

- Write `provider-api-key/service.ts` — encryption + repository orchestration.
- Write tests with mocked repository.

### Step 7: Implement Kysely migrations

- Write `migrations/001-provider-api-key.ts`.
- Write `migrations/index.ts` — migration runner.

### Step 8: Implement module factory

- Write `index.ts` — `createIamModule` factory that wires everything.
- Write integration test: create module → sign up → sign in → set API key → retrieve → delete.

### Step 9: Integrate into BFF

- Add `@platformik/module-iam-ts` to BFF dependencies.
- Update `container.ts` to create IAM module.
- Make `buildContainer` async.
- Add auth catch-all route.
- Add provider API key REST routes.

### Step 10: Database setup

- Add `platformik_iam` database to `docker-compose.yml` (or a second database on the existing
  PostgreSQL instance).
- Run BetterAuth migrations: `npx auth@latest migrate`.
- Run Kysely migrations: called on module startup or via a CLI command.

## Docker Compose Update

Add IAM database alongside the existing one:

```yaml
services:
  postgres-18.1:
    image: postgres:18.1-alpine
    environment:
      POSTGRES_USER: platformik-user
      POSTGRES_PASSWORD: platformik-password
      POSTGRES_DB: platformik
    ports:
      - '60001:5432'
    healthcheck:
      test: ['CMD-ONLY', 'pg_isready', '-U', 'platformik-user', '-d', 'platformik']
      interval: 5s
      timeout: 3s
      retries: 5
```

For the IAM database, two approaches:

1. **Separate database** on the same PostgreSQL instance — create via init script:
   ```sql
   CREATE DATABASE platformik_iam;
   ```
2. **Separate PostgreSQL schema** (`iam`) within the same database — BetterAuth supports
   `?options=-c search_path=iam` in the DSN.

Recommendation: start with option 2 (separate schema, same instance) for simplicity. Promote to a
separate database or instance when scaling demands it.

## Constraints

- Module must not import Fastify or any HTTP framework — it stays framework-agnostic.
- Module exports only via `"."` and `"./contracts"` — no deep imports.
- All IO (database, crypto) is injected via config or created internally from config — no globals.
- Encryption key must be provided externally (env var) — never hardcoded or generated by the module.
- Provider API key plaintext must never appear in logs.
- Follow existing code conventions: factory functions, typed configs, explicit exports.

## Open Questions (to decide during implementation)

1. **BetterAuth migration strategy**: run `npx auth@latest migrate` as a CLI step, or call
   `auth.api.migrate()` programmatically on startup? CLI is more explicit; programmatic is more
   convenient for dev.
2. **ID generation**: `crypto.randomUUID()` (built-in) vs `nanoid` (shorter, URL-safe). UUID is
   simpler — no extra dependency.
3. **Schema approach**: separate PG schema (`iam`) vs separate database (`platformik_iam`).
   Recommendation is separate schema for now, but confirm during implementation.
