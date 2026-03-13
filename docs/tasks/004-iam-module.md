# Task: Implement `packages/module-iam-ts` — Identity & Access Management Module

## Context

The platform needs tenant authentication: sign-up, sign-in, and session management. This module uses
[BetterAuth](https://better-auth.com/) as the internal auth engine and exposes a public programmatic API
consumed by the BFF composition root.

Provider API keys (BYOK) are **not part of IAM**. They belong to the AI side of the system (see
[Future AI credential store requirements](#future-ai-credential-store-requirements)).

## Scope

### In scope (this task)

- `packages/module-iam-ts` — tenant sign-up, sign-in, session management.
- BFF integration: explicit auth routes, auth middleware, session verification.
- Auth hardening baseline at the BFF boundary.
- IAM-owned committed migration history (BetterAuth core tables + any IAM extensions).
- Dedicated `platformik_iam` database (separate database, not schema-based isolation).
- Shared auth-request Zod contracts for BFF-to-web validation.
- Definition of proto-first auth-context contracts (`packages/contracts-auth-proto` and generated
  `packages/contracts-auth-ts`, `packages/contracts-auth-py`).

### Out of scope / deferred

- Provider API key storage, encryption, CRUD — belongs to a future AI credential store task.
- Audit logging — acknowledged, deferred to a separate capability with its own boundaries and storage.
- Database transport TLS/SSL — owned by app/runtime wiring, not IAM.
- Password reset / account recovery — explicitly deferred.
- Concurrent session limits — deferred.
- Captcha — out of scope.
- Fastify `trustProxy` — required before any non-localhost deployment (rate limiting and IP-based security are
  ineffective without it behind a reverse proxy). Must be configured before staging.
- Email delivery and verification flow — deferred. Local dev may mark test users verified directly in the DB.

## Tech Stack

- **Auth engine**: `better-auth` (latest)
- **Database**: PostgreSQL (dedicated database: `platformik_iam`)
- **Query builder**: `kysely` (BetterAuth's built-in adapter)
- **Validation**: `zod` (for contracts)
- **Test runner**: `bun test`

## Database

### Isolation policy

One PostgreSQL cluster is allowed, but each bounded context/module gets its own dedicated database. IAM uses
`platformik_iam`; AI will use its own database. No `search_path`-based schema isolation.

### IAM tables

BetterAuth requires these core tables (exact columns depend on BetterAuth version and enabled plugins):

- `user` — id, name, email, emailVerified, image, createdAt, updatedAt
- `session` — id, userId, token, expiresAt, createdAt, updatedAt
- `account` — id, userId, accountId, providerId, accessToken, refreshToken, password, ...
- `verification` — id, identifier, value, expiresAt, createdAt, updatedAt

All tables live in the `platformik_iam` database. There are no custom IAM extension tables in v1 beyond what
BetterAuth requires.

## Architecture / File Structure

```
packages/module-iam-ts/
├── src/
│   ├── module.ts              # Public: createIamModule factory
│   ├── contracts.ts           # Public: IamModule type, auth Zod schemas
│   ├── auth.ts                # Internal: BetterAuth instance factory
│   └── migrations/
│       ├── index.ts           # Migration registry (Kysely Migrator)
│       └── 001-betterauth-core.ts  # BetterAuth core tables as committed migration
├── __tests__/
│   ├── auth.test.ts           # BetterAuth instance creation
│   └── integration.test.ts    # Full module: sign-up → sign-in → session verify
├── package.json
└── tsconfig.json
```

### Package exports

Per `docs/architecture/boundaries.md`, exactly two public entry points:

- `"."` → `src/module.ts` — factory function, imported only by apps for wiring.
- `"./contracts"` → `src/contracts.ts` — public types, Zod schemas.

Everything else inside `src/` is internal.

## Module Contracts

### `contracts.ts` (exported via `"./contracts"`)

Public types and schemas. No implementation, no IO, no Fastify types, no BetterAuth types.

```ts
import { z } from 'zod'
import type { Generated, Kysely } from 'kysely'

// --- Kysely table schema (IAM database) ---

export interface IamUserTable {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image: string | null
  createdAt: Generated<Date>
  updatedAt: Generated<Date>
}

export interface IamSessionTable {
  id: string
  userId: string
  token: string
  expiresAt: Date
  createdAt: Generated<Date>
  updatedAt: Generated<Date>
}

export interface IamAccountTable {
  id: string
  userId: string
  accountId: string
  providerId: string
  accessToken: string | null
  refreshToken: string | null
  password: string | null
  // Additional BetterAuth columns as needed
}

export interface IamVerificationTable {
  id: string
  identifier: string
  value: string
  expiresAt: Date
  createdAt: Generated<Date>
  updatedAt: Generated<Date>
}

export interface IamDatabase {
  user: IamUserTable
  session: IamSessionTable
  account: IamAccountTable
  verification: IamVerificationTable
}

// --- Auth request validation schemas (shared with web client) ---

export const signUpBodySchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(12).max(128),
})
export type SignUpBody = z.infer<typeof signUpBodySchema>

export const signInBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})
export type SignInBody = z.infer<typeof signInBodySchema>

// --- Session result ---

export type SessionUser = {
  id: string
  name: string
  email: string
  emailVerified: boolean
}

export type SessionResult = {
  user: SessionUser
  session: {
    id: string
    expiresAt: Date
  }
}

// --- Module API surface ---

export type IamModule = {
  /** Named auth operations. Accept validated DTOs + Headers, return Response/Headers. */
  auth: {
    signUp: (body: SignUpBody, headers: Headers) => Promise<Response>
    signIn: (body: SignInBody, headers: Headers) => Promise<Response>
    signOut: (headers: Headers) => Promise<Response>
    getSession: (headers: Headers) => Promise<SessionResult | null>
  }
  /** Migration definitions for app-owned runner. */
  migrations: Record<string, { up: (db: unknown) => Promise<void>; down: (db: unknown) => Promise<void> }>
}

export type IamModuleDeps = {
  /** Already-created Kysely instance connected to the IAM database (typed with IamDatabase schema). */
  db: Kysely<IamDatabase>
  /** Base URL for auth routes (e.g. "http://localhost:3000") */
  baseUrl: string
  /** Secret for BetterAuth (session signing, etc.) */
  authSecret: string
  /** Trusted origins for BetterAuth's built-in CSRF/origin protection */
  trustedOrigins: string[]
}
```

Key design decisions reflected here:

- **No `userId` parameter** — auth operations derive identity from session/headers, not caller-supplied IDs.
- **No provider API key operations** — not IAM's responsibility.
- **No `dsn` or pool creation** — the app injects an already-created `Kysely<IamDatabase>` instance.
- **No `encryptionKey`** — provider key encryption is not IAM's concern.
- **`Headers` not Zod DTOs** — HTTP headers stay as standard `Headers`.
- **Migrations exposed as definitions** — the app-owned entrypoint executes them.

### `module.ts` (exported via `"."`)

Factory function that wires internal components. Accepts `IamModuleDeps`, returns `IamModule`.

```ts
import type { IamModule, IamModuleDeps } from './contracts'

export const createIamModule = (deps: IamModuleDeps): IamModule => {
  // 1. Create BetterAuth instance from deps.db + config
  // 2. Wire auth operations that delegate to BetterAuth internally
  // 3. Return IamModule interface
}
```

The factory is synchronous. It does not create pools, read env vars, or auto-migrate.

### IAM auth operations — internal design

The IAM module exposes named programmatic auth operations (`signUp`, `signIn`, `signOut`, `getSession`).
Internally, these may delegate to BetterAuth's request handler or programmatic API. The critical constraints
are:

- BetterAuth is an internal implementation detail — the public boundary must not leak BetterAuth types.
- If any BetterAuth flow requires true `Request` semantics, that bridge must stay **internal to IAM** and must
  preserve real HTTP semantics (method, URL, headers, cookies, body encoding, `Content-Type`).
- The BFF must **never** build a generic synthetic `Request` by re-stringifying Fastify-parsed bodies.
- IAM returns standard `Response`/`Headers` when cookie or header semantics are required (sign-in, sign-up,
  sign-out).
- `getSession` returns a plain `SessionResult | null` since it only needs to read cookies from `Headers`.

## Auth Hardening Baseline

Security is the top priority. Account takeover is the most realistic path to tenant credential theft once the
AI credential store exists.

### BFF boundary enforcement

- **Rate limiting**: Explicit auth routes (`sign-in`, `sign-up`) must use `@fastify/rate-limit`. Do not rely
  on a global limiter alone. Concrete limits: sign-in **5 requests/minute per IP**, sign-up **3
  requests/minute per IP**. These are additive with per-account throttling (see below).
- **CORS**: Use `@fastify/cors` with explicit allowed origins on the BFF server instance.
- **Generic auth failures**: Browser-facing auth error responses must not reveal whether an email exists, the
  password was wrong, or the account is verified. Detailed reasons may be logged server-side (subject to the
  logging safety rules below).
- **Request validation**: Auth request payloads are validated in the BFF against shared Zod contracts
  (canonical source of truth for password policy).

### Per-account login throttling

IP-based rate limiting alone is insufficient — an attacker with distributed IPs (botnet) can bypass it. Use
BetterAuth's built-in rate limiter plugin to enforce per-email throttling:

- After **5 consecutive failed sign-in attempts** for a given email, enforce exponential backoff (1s, 2s, 4s,
  8s, ... capped at 15 minutes).
- Must be **timing-safe**: apply the same delay and response shape whether the email exists or not, to prevent
  email enumeration via timing side-channels.
- Counter resets on successful sign-in.
- This is critical because once the AI credential store exists, a compromised account gives access to
  expensive provider API keys.

### Email enumeration prevention

Sign-up must not reveal whether an email is already registered:

- The BFF must catch all sign-up failures from the IAM module (including BetterAuth's "email already exists"
  error) and return a **uniform generic error response**. No error message may distinguish "email taken" from
  other sign-up failures.
- Once email delivery is implemented, the improved flow: if the email exists, silently skip account creation
  and send a "you already have an account" notification to the existing address.

### Session token storage

- Verify during implementation that BetterAuth **hashes session tokens** before writing them to the `session`
  table.
- If BetterAuth stores tokens as plaintext, configure or wrap to SHA-256 hash them before persistence.
- Rationale: a database breach must not yield usable session tokens. Plaintext tokens would allow immediate
  session hijack for all active users without needing to crack passwords.

### Logging safety

Auth-related logging must not leak sensitive data:

- **Must-not-log**: passwords, session tokens, full request bodies, `Authorization` / `Cookie` headers, raw
  stack traces containing user data.
- **Auth failure logs** must contain only: timestamp, event type, failure reason code, source IP.
- **Email in logs** must be truncated (e.g., `v***@example.com`) — never logged in full.
- This applies to all log levels including `debug`. Sensitive data must never appear in structured log fields,
  error serializations, or trace spans.

### Password policy

Enforced through BFF Zod validation. BetterAuth may mirror the same limits where practical.

- Minimum: 12 characters.
- Maximum: at least 128 characters.
- Passphrases allowed.
- No mandatory composition rules (no uppercase/lowercase/number/symbol requirements).
- **Hashing algorithm**: explicitly configure BetterAuth to use `scrypt` (BetterAuth's current default). Pin
  the algorithm in config — do not rely on implicit library defaults. If BetterAuth changes its default in a
  future version, the explicit config prevents a silent downgrade.

### Session and cookie security

- Session cookies: `HttpOnly`, `SameSite=Lax` or stricter.
- **`Secure` flag**: derived from the `baseUrl` protocol. If `baseUrl` starts with `https:`, set
  `Secure: true`. If `http://localhost`, set `Secure: false`. No separate env var toggle — the protocol is the
  single source of truth.
- Session identifiers must rotate on sign-in and auth-state transitions (session fixation prevention).
- Password changes must invalidate existing sessions.
- BetterAuth session/cookie behavior must be **explicitly configured** or **explicitly verified** during
  implementation. Do not assume library defaults are sufficient.

### CSRF and origin protection

- BetterAuth built-in CSRF and origin protections must remain **enabled** and be **verified** during
  implementation.
- BetterAuth `trustedOrigins` must be configured.
- For BFF-owned cookie-authenticated mutation routes outside BetterAuth, reject requests with missing or
  non-allowlisted `Origin`/`Referer`.
- **Sign-out CSRF**: `POST /api/auth/sign-out` must either route through BetterAuth's CSRF-protected request
  handler, or the BFF must verify `Origin`/`Referer` against `trustedOrigins` before processing. A CSRF-driven
  sign-out is a nuisance attack that degrades user experience.
- A custom non-simple header may be added for SPA-issued mutation requests as defense in depth.

### Server configuration

- Server-wide browser-facing Fastify security config (CORS, rate-limit plugin registration) should be wired in
  `apps/bff-web-platform-ts/src/container.ts`. `src/index.ts` remains a thin bootstrap entrypoint.

## Auth-Context Contracts

Cross-service auth context requires a proto-first contract so both TypeScript and Python services share the
same schema.

### New packages

| Package                         | Role                                        |
| ------------------------------- | ------------------------------------------- |
| `packages/contracts-auth-proto` | Source `.proto` files defining auth-context |
| `packages/contracts-auth-ts`    | Generated TypeScript types from proto       |
| `packages/contracts-auth-py`    | Generated Python types from proto           |

### Shared types (v1)

- **`ServiceActor`** — identifies the immediate internal service caller.
- **`UserSubject`** — identifies the real authenticated user the operation is about.
- **`AuthContext`** — wraps `actor: ServiceActor` and optional `subject: UserSubject`.

### Design constraints

- These are **cross-cutting auth-context types**, not IAM domain data. They must not live in the IAM module.
- Contracts packages define **schema and types only** — no BetterAuth integration, no Fastify types, no JWT
  signing, no env reads, no IO/runtime behavior.
- For in-memory BFF-to-module calls, passing `UserSubject` is sufficient.
- For cross-service calls on behalf of an authenticated user, the BFF signs an internal JWT containing
  `actor = ServiceActor` + `subject = UserSubject`.
- Service-to-service calls without an end user may send a token containing only `ServiceActor`.
- Downstream services verify the internal token, reconstruct plain `AuthContext`, and authorize against it.

### Boundary policy coordination (prerequisite — Step 0)

This task introduces a **boundary rule change**: modules may now import contracts packages. This is required
so that modules (e.g., `module-iam-ts`) and services (e.g., `service-ai-py`) can consume shared auth-context
types.

Per `boundaries.md` Change Policy, all three must update in **one changeset**:

1. **`docs/architecture/boundaries.md`** — update dependency flow from `module: lib, runtime, vendor` to
   `module: lib, contracts, runtime, vendor`. Add `contracts-auth-*` packages to examples.
2. **`tooling/dep-policy/policy.yaml`** — add `contracts-auth-proto`, `contracts-auth-ts`, `contracts-auth-py`
   as allowed packages.
3. **Enforcement tooling** — update related configs/tests if needed.

Additionally, codegen tooling/config for proto → TS/PY generation must be set up.

This coordination is **Step 0** of the implementation — it must be completed before any code that depends on
the new contracts packages.

## BFF Integration

### Auth middleware

The BFF owns auth middleware for protected routes:

1. Middleware calls `iam.auth.getSession(headers)` to verify the browser session.
2. Missing/invalid session → `401`. Do not call downstream modules or services.
3. Authenticated but unauthorized → `403`.
4. After successful authentication, the BFF derives `UserSubject` from `SessionResult` and stores it as
   **BFF-local Fastify request state** (request decoration). This is an app-local transport detail — shared
   auth contracts must not expose Fastify types.

### Explicit auth routes

The BFF exposes named auth routes instead of a catch-all:

```
POST /api/auth/sign-up    — validated with signUpBodySchema, calls iam.auth.signUp()
POST /api/auth/sign-in    — validated with signInBodySchema, calls iam.auth.signIn()
POST /api/auth/sign-out   — calls iam.auth.signOut()
GET  /api/auth/session     — calls iam.auth.getSession()
```

Each route:

1. Validates request payload against shared Zod contracts (body/query, not headers).
2. Calls the corresponding named IAM auth operation with validated DTOs + `Headers`.
3. Forwards the resulting headers/cookies/status/body to the HTTP response.
4. Uses `@fastify/rate-limit` for sign-in and sign-up routes.

### Container wiring (`apps/bff-web-platform-ts/src/container.ts`)

```ts
import { createPgPool } from '@platformik/runtime-pg-ts'
import { Kysely, PostgresDialect } from 'kysely'
import { createIamModule } from '@platformik/module-iam-ts'
import type { IamModule, IamDatabase } from '@platformik/module-iam-ts/contracts'

// --- Startup env var validation (fail fast, no fallbacks) ---

const requireEnv = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export type AppContainer = {
  server: FastifyInstance
  logger: Logger
  iam: IamModule
}

export const buildContainer = async (): Promise<AppContainer> => {
  const env = {
    iamDatabaseUrl: requireEnv('IAM_DATABASE_URL'),
    authBaseUrl: requireEnv('AUTH_BASE_URL'),
    authSecret: requireEnv('AUTH_SECRET'),
    clientOrigin: requireEnv('CLIENT_ORIGIN'),
  }

  const logger = createPinoLogger({ level: 'info', name: 'bff-web-platform' })
  const server = createFastifyServer({ logger })

  // App owns DB pool creation via runtime-pg-ts
  const iamPool = createPgPool(env.iamDatabaseUrl)
  const iamDb = new Kysely<IamDatabase>({ dialect: new PostgresDialect({ pool: iamPool }) })

  const iam = createIamModule({
    db: iamDb,
    baseUrl: env.authBaseUrl,
    authSecret: env.authSecret,
    trustedOrigins: [env.clientOrigin],
  })

  // Register CORS, rate-limit plugins on server here

  return { server, logger, iam }
}
```

Key points:

- **Fail-fast env validation** — all critical env vars (`IAM_DATABASE_URL`, `AUTH_SECRET`, `AUTH_BASE_URL`,
  `CLIENT_ORIGIN`) are validated at startup. Missing values throw with the variable name. No `??` fallbacks,
  no `!` assertions.
- The **app creates the DB pool** via `runtime-pg-ts` and the **Kysely instance inline** (typed with
  `IamDatabase`).
- The module receives a fully-typed `Kysely<IamDatabase>` instance.
- No `encryptionKey` — provider key encryption is not IAM's concern.

## Migrations

### Principles

1. **One committed migration history** for the IAM database.
2. **App-owned migration entrypoint** — the app owns DSNs, runtime wiring, and connection lifecycle.
3. **BetterAuth is not the production runtime migration runner.** BetterAuth may be used as a tooling step to
   generate or detect required schema changes, but those changes must become committed IAM-owned migrations.
4. **Migration ordering is explicit** — any FK to auth-owned tables must appear after the referenced tables
   are created.
5. **No `npx`** — use repo `bun`/`mise`/`moon` conventions for any BetterAuth tooling step.
6. **No silent auto-migration** on app startup.

### Migration flow

```
BetterAuth config change → tooling generates SQL diff → developer commits as Kysely migration
                                                       → app migration command applies it
```

The module owns migration definitions (they live in `packages/module-iam-ts/src/migrations/`). The app owns
the runnable migration command.

## Docker Compose

Add IAM database via PostgreSQL init script on the existing instance:

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
    volumes:
      - ./docker/postgres/init:/docker-entrypoint-initdb.d
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U platformik-user -d platformik']
      interval: 5s
      timeout: 3s
      retries: 5
```

Init script (`docker/postgres/init/01-create-databases.sql`):

```sql
CREATE DATABASE platformik_iam;
```

## Implementation Steps

### Step 0: Boundary policy update (prerequisite)

- Update `docs/architecture/boundaries.md`: change dependency flow from `module: lib, runtime, vendor` to
  `module: lib, contracts, runtime, vendor`.
- Update `tooling/dep-policy/policy.yaml`: add `contracts-auth-proto`, `contracts-auth-ts`,
  `contracts-auth-py`.
- Update enforcement tooling configs/tests if needed.
- All three changes in **one changeset** per boundaries.md Change Policy.

### Step 1: Auth-context contracts

- Create `packages/contracts-auth-proto` with `ServiceActor`, `UserSubject`, `AuthContext` proto definitions.
- Set up codegen to produce `packages/contracts-auth-ts` and `packages/contracts-auth-py`.
- This must happen early because downstream steps may depend on these types.

### Step 2: Database setup

- Add IAM database init script to Docker Compose (`docker/postgres/init/01-create-databases.sql`).
- Create app-owned migration command for the IAM database.

### Step 3: Scaffold the package

- Create `packages/module-iam-ts/` with `package.json`, `tsconfig.json`, `moon.yml`.
- Add dependencies: `better-auth`, `kysely`, `zod`.
- Configure package exports: `"."` → `src/module.ts`, `"./contracts"` → `src/contracts.ts`.
- Wire into the monorepo workspace.

### Step 4: Implement contracts

- Write `src/contracts.ts` with `IamDatabase` (Kysely table schema), `IamModule`, `IamModuleDeps`, auth Zod
  schemas, session types.
- `IamModuleDeps.db` is typed as `Kysely<IamDatabase>` for full compile-time safety.
- Types only — no implementation, no IO.

### Step 5: Implement BetterAuth wrapper

- Write `src/auth.ts` — internal BetterAuth instance factory.
- Configure: `emailAndPassword: { enabled: true }`, `trustedOrigins`, session/cookie settings.
- Explicitly configure or verify: `HttpOnly`, `Secure` (derived from `baseUrl` protocol), `SameSite`, session
  rotation, CSRF protection.
- Explicitly pin `scrypt` as the password hashing algorithm.
- Enable BetterAuth's built-in rate limiter plugin for per-account throttling (5 failures → exponential
  backoff, capped at 15 min, timing-safe).
- Disable `ipAddress` and `userAgent` collection in session config (no PII storage).
- Verify session tokens are hashed before DB storage; if not, configure/wrap to SHA-256 hash them.

### Step 6: Implement IAM auth operations

- Wire named auth operations (`signUp`, `signIn`, `signOut`, `getSession`) that delegate to BetterAuth
  internally.
- Ensure BetterAuth types do not leak through the public boundary.
- If any operation needs a `Request` bridge, keep it internal to the module.

### Step 7: Implement committed migrations

- Use BetterAuth tooling to generate required core table DDL.
- Commit as `src/migrations/001-betterauth-core.ts` (Kysely migration format).
- Ensure migration reflects disabled `ipAddress`/`userAgent` columns.
- Write `src/migrations/index.ts` — migration registry.

### Step 8: Implement module factory

- Write `src/module.ts` — `createIamModule(deps)` that wires auth operations and exposes migrations.
- Factory is synchronous. No pool creation, no env reads, no auto-migration.

### Step 9: Write tests

- Unit: BetterAuth instance creation, auth operation wiring.
- Integration (requires test DB): sign-up → sign-in → session verify → sign-out.
- Verify: generic error on duplicate email sign-up (no email enumeration leakage).
- Verify: session token is not stored as plaintext in DB.
- Verify: `ipAddress` and `userAgent` are not stored.

### Step 10: Integrate into BFF

- Add `@platformik/module-iam-ts` to BFF dependencies.
- Update `container.ts`:
  - Add fail-fast env var validation (`requireEnv`) for `IAM_DATABASE_URL`, `AUTH_SECRET`, `AUTH_BASE_URL`,
    `CLIENT_ORIGIN`.
  - Create IAM DB pool via `runtime-pg-ts` (`createPgPool(dsn)`).
  - Create Kysely instance inline: `new Kysely<IamDatabase>({ dialect: new PostgresDialect({ pool }) })`.
  - Create IAM module with validated env vars (no `??` fallbacks, no `!` assertions).
- Register `@fastify/cors` with explicit origins.
- Register `@fastify/rate-limit`: sign-in 5 req/min per IP, sign-up 3 req/min per IP.
- Register explicit auth routes (`/api/auth/sign-in`, `/api/auth/sign-up`, `/api/auth/sign-out`,
  `/api/auth/session`).
- Sign-up route: catch all IAM failures and return uniform generic error (email enumeration prevention).
- Sign-out route: ensure CSRF protection via `Origin`/`Referer` verification or BetterAuth's handler.
- Implement auth middleware for protected routes (session verification → `UserSubject` → request state).
- Add shared Zod contracts package or extend existing contracts for auth request validation.
- Run migrations via the app-owned entrypoint.

## Future AI Credential Store Requirements

These requirements are **out of scope for this IAM task** but are documented here because they were
established during review and constrain future design.

### Ownership

- Provider API keys belong to the AI side of the system.
- `service-ai-py` is the intended process boundary for decryption and provider API usage.
- The BFF must **never** receive plaintext provider API keys and must **never** hold provider-key encryption
  capability.

### Encryption and storage

- Stored credential records must carry `key_version` or equivalent metadata to support online key rotation.
- Encryption-key config must be validated at startup; fail fast on invalid format.
- If raw symmetric key material is configured directly, require exactly 32 bytes after decoding (e.g. 64 hex
  chars).
- v1 key-loss policy: explicit no-recovery. If key material is lost, stored credentials are unreadable and
  users must re-enter them. KMS-backed envelope encryption is deferred.

### Leak prevention

- Plaintext provider keys must **never** cross public module contracts, BFF APIs, or cross-service gRPC
  boundaries.
- Plaintext keys exist only transiently in memory inside `service-ai-py` while making the outbound provider
  call.
- Transient plaintext must **never** be logged, serialized into errors, traces, metrics labels, or debug
  output.
- `getDecrypted()` or equivalent plaintext-returning methods must **not** exist in public contracts.

### Metadata

- Settings views must not decrypt keys to render metadata.
- Non-sensitive display metadata such as `last4` must be persisted at write time.
- Public APIs expose only: set/store, list metadata, delete, and provider-backed execution flows.

### Access control

- A verified email is required before a user may add, replace, or delete AI provider keys.
- No dev-mode bypass for unverified users.
- Local dev may mark test users verified directly in the DB until real email verification exists.

### Database

- AI uses its own dedicated database (not shared with IAM).

## Deferred / Out of Scope

| Item                                | Status       | Notes                                                                                                                                                                                                      |
| ----------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider API key storage/encryption | Future task  | Belongs to AI credential store, not IAM                                                                                                                                                                    |
| Audit logging                       | Deferred     | Separate capability with its own boundaries                                                                                                                                                                |
| DB transport TLS/SSL                | Deferred     | Owned by app/runtime wiring                                                                                                                                                                                |
| Password reset / account recovery   | Deferred     | Not part of current task scope                                                                                                                                                                             |
| Concurrent session limits           | Deferred     | May be added later                                                                                                                                                                                         |
| Captcha                             | Out of scope | Not planned for auth routes                                                                                                                                                                                |
| Fastify `trustProxy`                | Deferred     | Required before any non-localhost deployment. Rate limiting and IP-based security (including per-account throttling) are ineffective without it behind a reverse proxy. Must be configured before staging. |
| Email delivery/verification flow    | Deferred     | Test users verified via DB until real flow exists                                                                                                                                                          |
| `service-iam-ts` gRPC promotion     | Future task  | If IAM needs to serve other services beyond BFF                                                                                                                                                            |
| KMS-backed envelope encryption      | Future task  | For AI credential store key recovery                                                                                                                                                                       |
