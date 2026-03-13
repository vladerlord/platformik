# 007 — Rewrite CLI to Ink + Switch BFF Transport to HTTP/SSE

## Before You Start

- Read `AGENTS.md` for mandatory validation, tooling, and documentation rules.
- Read `docs/architecture/boundaries.md` before scaffolding any new app or package.
- Read `docs/stacks/typescript.md` before writing any TypeScript.
- Follow the repo TypeScript stack conventions: `neverthrow` for expected failures, `ts-pattern` at transport
  boundaries.

---

## Context

The monorepo already contains:

| Path                                    | Role                                                        |
| --------------------------------------- | ----------------------------------------------------------- |
| `apps/cli-platform-ts`                  | CLI client — currently built with Effect-TS + readline REPL |
| `apps/bff-cli-platform-ts`              | BFF for CLI — currently a gRPC server (nice-grpc)           |
| `packages/contracts-cli-platform-proto` | Proto source for CLI ↔ BFF gRPC interface                   |
| `packages/contracts-cli-platform-ts`    | Generated TypeScript gRPC stubs                             |
| `apps/service-workflows-ts`             | Workflow orchestration service (gRPC, Temporal)             |
| `packages/module-iam-ts`                | IAM module — sign-up, sign-in, session management           |

### Current state

`apps/cli-platform-ts` is built on **Effect-TS** with a readline-based REPL. It communicates with
`apps/bff-cli-platform-ts` over **gRPC unary** calls using `nice-grpc`. The BFF is also an Effect-TS
application serving a gRPC endpoint.

Reference implementation: [gemini-cli](https://github.com/google-gemini/gemini-cli) — an Ink-based terminal
application that demonstrates the patterns we want to adopt.

---

## Goal

1. **Rewrite `apps/cli-platform-ts`** from Effect-TS to [Ink](https://github.com/vadimdemedes/ink) (React for
   CLI), removing the Effect runtime entirely from the CLI app.
2. **Replace gRPC transport** between `cli-platform-ts` and `bff-cli-platform-ts` with **HTTP REST + SSE**
   (Server-Sent Events).
3. **Rewrite `apps/bff-cli-platform-ts`** from a gRPC server to an **HTTP server** (e.g., Fastify or Hono)
   that serves REST endpoints and SSE streams.

The BFF still communicates with `service-workflows-ts` over gRPC internally — only the CLI ↔ BFF transport
changes.

---

## Architecture After This Task

### Transport change

Before:

```
CLI ──gRPC unary──► bff-cli-platform-ts ──gRPC unary──► service-workflows-ts
```

After:

```
CLI ──HTTP/SSE──► bff-cli-platform-ts ──gRPC unary──► service-workflows-ts
```

### Tech stack change

| Component             | Before                         | After                               |
| --------------------- | ------------------------------ | ----------------------------------- |
| `cli-platform-ts`     | Effect-TS, readline, nice-grpc | Ink (React), HTTP client (fetch/ky) |
| `bff-cli-platform-ts` | Effect-TS, nice-grpc server    | HTTP server (Fastify or Hono), SSE  |
| CLI ↔ BFF transport   | gRPC unary                     | HTTP REST + SSE                     |
| BFF ↔ workflows       | gRPC (unchanged)               | gRPC (unchanged)                    |

---

## CLI Rewrite — `apps/cli-platform-ts`

### Framework

Use [Ink](https://github.com/vadimdemedes/ink) — a React renderer for the terminal. This gives us:

- Component-based UI with React hooks
- Rich terminal rendering (colors, spinners, layouts)
- Testable components via `ink-testing-library`
- Familiar React mental model

### Remove Effect-TS

The CLI currently uses Effect-TS for:

- Service/dependency injection (`Effect.Service<T>()`)
- Scoped resource management (`Effect.acquireRelease()`)
- Control flow (`Effect.gen()`, `Effect.forever()`, `Effect.sleep()`)
- Error handling (`Effect.flatMap()`, `Effect.mapError()`)
- Runtime management (`Effect.runFork()`, `Fiber.interrupt()`)

Replace with:

| Effect-TS pattern              | Replacement                                      |
| ------------------------------ | ------------------------------------------------ |
| `Effect.Service<T>()`          | React context / plain modules                    |
| `Effect.gen()` / generators    | async/await                                      |
| `Effect.acquireRelease()`      | `useEffect` cleanup / explicit cleanup functions |
| `Effect.forever()` + `sleep()` | `setInterval` / SSE event stream                 |
| `Ref<Option<string>>`          | React state (`useState`)                         |
| Layer composition              | React component tree / context providers         |
| `Effect.runFork()`             | Standard async functions                         |

### CLI structure

```
apps/cli-platform-ts/
├── bin/
│   └── cli.tsx              # Entry point — render(<App />)
├── src/
│   ├── app.tsx              # Root component — routing between screens
│   ├── api/
│   │   └── client.ts        # HTTP client for BFF (fetch or ky)
│   ├── hooks/
│   │   ├── use-auth.ts      # Authentication state and login
│   │   ├── use-workflows.ts # Workflow listing
│   │   └── use-run.ts       # Workflow run state + SSE subscription
│   ├── components/
│   │   ├── login-screen.tsx    # Login form
│   │   ├── workflow-list.tsx   # /workflows display
│   │   ├── run-view.tsx        # Active workflow run — messages + input
│   │   ├── message.tsx         # Single message renderer
│   │   ├── option-input.tsx    # Option selection UI
│   │   └── status-bar.tsx      # Connection status, current run info
│   └── context/
│       └── auth-context.tsx # Auth token provider
```

### Key patterns

**1. API client** — plain TypeScript module, no Effect:

```typescript
// src/api/client.ts
class BffClient {
  constructor(private baseUrl: string, private token?: string) {}

  async login(email: string, password: string): Promise<LoginResponse> { ... }
  async listWorkflows(): Promise<ListWorkflowsResponse> { ... }
  async startWorkflow(workflowId: string): Promise<StartWorkflowResponse> { ... }
  async submitAnswer(runId: string, answer: SubmitAnswerPayload): Promise<void> { ... }

  // Returns an EventSource or async iterator for SSE
  subscribeToRun(runId: string, afterId?: string): EventSource { ... }
}
```

**2. SSE subscription for run updates** — replaces polling:

```typescript
// src/hooks/use-run.ts
function useRun(runId: string) {
  const [messages, setMessages] = useState<Message[]>([])
  const [status, setStatus] = useState<RunStatus>('active')
  const [pendingInput, setPendingInput] = useState<PendingInput | null>(null)

  useEffect(() => {
    const source = client.subscribeToRun(runId, lastMessageId)

    source.addEventListener('message', (event) => {
      // Append new messages, update status
    })

    source.addEventListener('status', (event) => {
      // Update run status
    })

    return () => source.close()
  }, [runId])
}
```

**3. Component-based rendering** — replaces manual console.log:

```tsx
// src/components/run-view.tsx
function RunView({ runId }: { runId: string }) {
  const { messages, status, pendingInput } = useRun(runId)

  return (
    <Box flexDirection="column">
      {messages.map((msg) => (
        <Message key={msg.id} message={msg} />
      ))}
      {pendingInput && <OptionInput input={pendingInput} onSubmit={handleSubmit} />}
      {status === 'completed' && <Text color="green">Run completed</Text>}
    </Box>
  )
}
```

### Commands

Same commands as before, but rendered as Ink components:

| Command                     | Behaviour                                             |
| --------------------------- | ----------------------------------------------------- |
| `/workflows`                | Renders workflow list component                       |
| `/start <workflow-id>`      | Starts run, switches to RunView with SSE subscription |
| `/attach <workflow-run-id>` | Fetches existing run, switches to RunView with SSE    |

---

## BFF Rewrite — `apps/bff-cli-platform-ts`

### Framework

Replace the gRPC server with an HTTP server. Choose one of:

- **Hono** — lightweight, fast, good middleware support
- **Fastify** — mature, plugin ecosystem, schema validation

Recommended: **Hono** for simplicity and alignment with the lightweight BFF role.

### Remove Effect-TS

Same approach as CLI — replace Effect patterns with plain async/await and `neverthrow` for error handling.

The BFF currently uses Effect-TS for:

- Service/dependency injection
- gRPC server lifecycle
- Handler execution through Effect runtime
- IAM integration

Replace with:

| Effect-TS pattern           | Replacement                       |
| --------------------------- | --------------------------------- |
| `Effect.Service<T>()`       | Plain classes / factory functions |
| Effect runtime for handlers | Standard async route handlers     |
| Layer composition           | Dependency injection at startup   |
| `Effect.gen()`              | async/await                       |

### HTTP API endpoints

| Method | Path                                | Description                    | Replaces gRPC RPC      |
| ------ | ----------------------------------- | ------------------------------ | ---------------------- |
| POST   | `/api/v1/auth/login`                | Authenticate, return token     | `Login`                |
| GET    | `/api/v1/workflows`                 | List available workflows       | `ListWorkflows`        |
| POST   | `/api/v1/workflows/runs`            | Start a workflow run           | `StartWorkflow`        |
| GET    | `/api/v1/workflows/runs/:id`        | Get workflow run view          | `GetWorkflowRunView`   |
| POST   | `/api/v1/workflows/runs/:id/answer` | Submit answer to pending input | `SubmitAnswer`         |
| GET    | `/api/v1/workflows/runs/:id/events` | SSE stream for run updates     | New (replaces polling) |

### SSE endpoint — `/api/v1/workflows/runs/:id/events`

This is the key new capability. Instead of the CLI polling `GetWorkflowRunView`, the BFF pushes updates via
SSE.

**SSE event types:**

| Event type      | Data                                  | When                      |
| --------------- | ------------------------------------- | ------------------------- |
| `message`       | `ConversationMessage` JSON            | New message persisted     |
| `status`        | `{ status, revision, currentNodeId }` | Run status changes        |
| `pending_input` | `PendingInput` JSON or `null`         | Input required or cleared |
| `heartbeat`     | `{}`                                  | Keep-alive every ~15s     |

**Implementation approach:**

The BFF subscribes to run state changes and pushes them to connected SSE clients. Options:

1. **Poll PostgreSQL** via `GetWorkflowRunView` on the backend (simplest, reuses existing gRPC call to
   `service-workflows-ts`)
2. **Subscribe to Redis Streams** for real-time events from `event_outbox` dispatcher (more efficient, uses
   existing event bus)

Recommended: Start with option 1 (poll internally) for simplicity. The polling happens server-side in the BFF,
so the client still gets a clean SSE stream. Migrate to Redis Streams subscription later for lower latency.

### Authentication

Same flow, adapted for HTTP:

1. CLI calls `POST /api/v1/auth/login` with `{ email, password }`
2. BFF returns `{ sessionToken }` in JSON response
3. CLI sends `Authorization: Bearer <token>` header on every request
4. BFF validates token via `module-iam-ts` and injects auth context into downstream gRPC calls

### Error responses

Use standard HTTP status codes with JSON error bodies:

```json
{
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "You do not have access to this workflow run"
  }
}
```

| gRPC status         | HTTP status |
| ------------------- | ----------- |
| `OK`                | 200         |
| `NOT_FOUND`         | 404         |
| `PERMISSION_DENIED` | 403         |
| `UNAUTHENTICATED`   | 401         |
| `INVALID_ARGUMENT`  | 400         |
| `INTERNAL`          | 500         |

---

## Contract Changes

### Remove gRPC contracts for CLI ↔ BFF

The following packages become unnecessary for the CLI ↔ BFF interface:

- `packages/contracts-cli-platform-proto` — no longer needed for HTTP transport
- `packages/contracts-cli-platform-ts` — no longer needed for HTTP transport

Options:

1. **Delete** them if no other consumers depend on them.
2. **Keep** them temporarily and remove in a follow-up cleanup task.

Recommended: Delete them in this task to avoid stale code.

### Shared types

Define shared request/response types in a new lightweight package or co-locate them:

- Option A: Create `packages/contracts-cli-platform-http-ts` with Zod schemas for request/response validation
  (shared between CLI and BFF).
- Option B: Define types only in the BFF and let the CLI use plain TypeScript interfaces.

Recommended: Option A if we want runtime validation on both sides. Option B for simplicity.

### Internal gRPC unchanged

`bff-cli-platform-ts` → `service-workflows-ts` communication remains gRPC. No changes to:

- `packages/contracts-workflows-proto`
- `packages/contracts-workflows-ts`

---

## Dependencies Change

### `apps/cli-platform-ts` — new dependencies

| Add                | Purpose                                           |
| ------------------ | ------------------------------------------------- |
| `ink`              | React renderer for terminal                       |
| `react`            | UI framework                                      |
| `ink-text-input`   | Text input component                              |
| `ink-select-input` | Selection component                               |
| `ink-spinner`      | Loading spinners                                  |
| `eventsource`      | SSE client (or use native `fetch` with streaming) |

| Remove                                  | Reason                          |
| --------------------------------------- | ------------------------------- |
| `effect`                                | No longer used                  |
| `nice-grpc`                             | Replaced by HTTP client         |
| `@platformik/contracts-cli-platform-ts` | gRPC stubs no longer needed     |
| `@platformik/runtime-pino-ts`           | Effect-based logger, not needed |

### `apps/bff-cli-platform-ts` — new dependencies

| Add                   | Purpose                              |
| --------------------- | ------------------------------------ |
| `hono` (or `fastify`) | HTTP server framework                |
| `@hono/node-server`   | Node.js adapter for Hono             |
| `zod`                 | Request validation (already present) |

| Remove                                  | Reason                          |
| --------------------------------------- | ------------------------------- |
| `effect`                                | No longer used                  |
| `nice-grpc` (server)                    | Replaced by HTTP server         |
| `@platformik/contracts-cli-platform-ts` | gRPC stubs no longer needed     |
| `@platformik/runtime-pino-ts`           | Effect-based logger, not needed |

Note: The BFF still needs `nice-grpc` as a **client** to talk to `service-workflows-ts` over gRPC.

---

## Out of Scope

- Changes to `service-workflows-ts` — stays as-is with gRPC
- Changes to `module-iam-ts` — the BFF still uses it the same way, just without Effect wrapping
- WebSocket support — SSE is sufficient for server→client push
- Token persistence to disk — token remains in memory for now
- AI provider integration or streaming
- Web UI changes

---

## Implementation Order

### Step 1 — Rewrite `apps/bff-cli-platform-ts` to HTTP server

- Replace gRPC server with Hono (or Fastify)
- Implement REST endpoints for all existing RPCs
- Implement SSE endpoint for run events
- Keep gRPC client to `service-workflows-ts`
- Remove Effect-TS, use plain async/await + `neverthrow`
- Keep IAM integration via `module-iam-ts`
- Validate:
  - `moon run bff-cli-platform-ts:fix`
  - `moon run bff-cli-platform-ts:validate`

### Step 2 — Rewrite `apps/cli-platform-ts` to Ink

- Replace Effect-TS runtime with Ink (React)
- Implement HTTP client for BFF communication
- Implement SSE subscription for run updates
- Build Ink components: login, workflow list, run view, message renderer, option input
- Implement REPL commands as component state transitions
- Validate:
  - `moon run cli-platform-ts:fix`
  - `moon run cli-platform-ts:validate`

### Step 3 — Remove unused gRPC contracts

- Delete `packages/contracts-cli-platform-proto` (if no other consumers)
- Delete `packages/contracts-cli-platform-ts` (if no other consumers)
- Remove references from `pnpm-workspace.yaml` and `moon.yml` files
- Validate:
  - `moon run tooling-content:validate`

### Step 4 — Integration smoke test

- Start PostgreSQL, Redis, `service-workflows-ts`, and `bff-cli-platform-ts`
- Run `apps/cli-platform-ts --login <email> --password <pass>`
- Verify:
  - Login succeeds with seeded dev credentials
  - `/workflows` renders workflow list via Ink components
  - `/start <id>` creates a run, SSE stream connects, messages render in real-time
  - Option input renders and `SubmitAnswer` works
  - `/attach <workflow-run-id>` loads existing run and connects SSE
  - SSE reconnects automatically on disconnect
  - Ctrl+C exits cleanly
  - A different user cannot access another user's run (403)

---

## Key Invariants

| Invariant                                | Enforced by                                     |
| ---------------------------------------- | ----------------------------------------------- |
| CLI ↔ BFF communication is HTTP/SSE only | No gRPC dependency in CLI                       |
| BFF ↔ service-workflows-ts remains gRPC  | nice-grpc client in BFF                         |
| No Effect-TS in CLI or BFF               | Dependencies removed, Ink + async/await         |
| SSE replaces client-side polling         | BFF pushes updates, CLI subscribes              |
| Auth flow unchanged semantically         | Bearer token over HTTP instead of gRPC metadata |
| Run ownership still verified by BFF      | Auth middleware on all endpoints                |
| PostgreSQL remains source of truth       | No changes to service-workflows-ts              |
