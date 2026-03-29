# 006 — Workflows CLI

## Before You Start

- Read `AGENTS.md` for mandatory validation, tooling, and documentation rules.
- Read `docs/architecture/boundaries.md` before scaffolding any new app or package.
- Read `docs/stacks/typescript.md` before writing any TypeScript.
- Follow the repo TypeScript stack conventions: `neverthrow` for expected failures, `ts-pattern` at transport
  boundaries.

---

## Context

The monorepo already contains:

| Path                                   | Role                                                           |
| -------------------------------------- | -------------------------------------------------------------- |
| `apps/service-workflows-ts`            | gRPC backend — Temporal orchestrator for workflow execution    |
| `packages/contracts-workflows-proto`   | Proto source for `WorkflowsService`                            |
| `packages/contracts-workflows-ts`      | Generated TypeScript client/server stubs                       |
| `packages/module-workflows-ts`         | Business logic module (workflow definitions, DB access)        |
| `packages/module-iam-ts`               | IAM module — sign-up, sign-in, session management              |
| `packages/runtime-temporal-ts`         | Temporal client/worker bootstrap                               |
| `packages/runtime-pg-ts`               | PostgreSQL pool runtime                                        |
| `apps/bff-web-platform-ts`             | Web BFF — uses `module-iam-ts` for session-based auth          |
| `apps/bff-web-platform-ts/bin/seed.ts` | Dev user seed — user ID `01970000-0000-7000-8000-000000000001` |

There is an existing Python TUI in `apps/service-ai-py/src/platformik_service_ai/tui/` that talks to Temporal
directly. This task replaces it with a production-grade TypeScript CLI that communicates through a proper BFF
layer.

This task intentionally removes AI and client-side streaming from scope. The objective is to establish a
simple, correct foundation for:

- Temporal orchestration in `apps/service-workflows-ts`
- installable CLI client in `apps/cli-platform-ts`
- PostgreSQL-backed workflow history
- internal async event delivery for future workers and integrations

The canonical state for workflow execution and user-visible history lives in PostgreSQL in
`platformik_workflows`.

---

## Goal

Build a typed TypeScript console application (`apps/cli-platform-ts`) that lets a developer:

1. List available workflows (`/workflows`)
2. Start a workflow run (`/start <workflow-id>`)
3. Interact with the running workflow by rendering conversation history and submitting answers
4. Detach and re-attach to a running workflow run (`/attach <workflow-run-id>`)

All communication between CLI and backend goes through a new BFF: `apps/bff-cli-platform-ts`.

This iteration does not include token streaming, SSE, WebSocket, or gRPC server-streaming.

---

## Architecture Principles

### Source of truth

- PostgreSQL in `platformik_workflows` is the source of truth for workflow execution state and user-visible
  conversation history.
- Temporal is the source of truth for orchestration progress, retries, timers, and workflow completion.
- Redis is used only as an internal event bus for asynchronous processing. It is not used as a client
  transport or correctness layer.

### ID policy

- All entity IDs in this task must be `UUIDv7`.
- IDs are generated in the application layer before writing to PostgreSQL.
- Do not use `gen_random_uuid()` or any other database-side random UUID default for workflow-domain entities.
- This rule applies to all new workflow-domain rows, including `conversations`, `messages`, `node_runs`,
  `run_events`, and `event_outbox`.

### Two models, not one

The system keeps two related but different histories:

- `run_events`: append-only execution journal for orchestration, debugging, and coarse audit
- `messages`: user-facing conversation history rendered by CLI and future clients

Do not attempt to render product UX directly from Temporal history or from Redis.

### Simple reconnect contract

Reconnect works as:

1. Client calls `GetWorkflowRunView`
2. Client renders any unseen messages
3. Client inspects run status and pending input
4. Client polls again if the run is still active

There is no replay of transient events because there are no transient client events in this iteration.

### Async only where needed

- CLI communication is unary gRPC only
- workflow state changes are persisted synchronously in PostgreSQL
- event publication happens asynchronously through an outbox
- future background workers and integrations consume internal events from the event bus

---

## System Architecture

### Control plane

Low-frequency commands:

```
CLI ──gRPC unary──► bff-cli-platform-ts ──gRPC unary──► service-workflows-ts ──► Temporal
```

Examples:

- `Login`
- `ListWorkflows`
- `StartWorkflow`
- `GetWorkflowRunView`
- `SubmitAnswer`

### Persistence plane

Canonical state and history:

```
service-workflows-ts ──writes──► PostgreSQL (platformik_workflows)
```

Persisted entities:

- workflow definitions and workflow runs
- conversations and messages
- node execution state
- run events
- event outbox

### Internal async plane

Internal event delivery only:

```
service-workflows-ts ──publish──► event_outbox (PostgreSQL)
                                     │
                              dispatcher worker
                                     │
                                     └──► Redis Streams
                                              │
                                   future internal consumers
```

Examples of future consumers:

- Telegram worker
- email worker
- webhook trigger worker
- notification worker

### Why Redis Streams are acceptable here

Redis Streams are a good fit for the internal event bus because the semantics are worker-oriented:

- consumer groups
- at-least-once internal processing
- no client fan-out requirements

They are not used for client delivery in this task.

---

## New Apps and Packages

### Create `apps/bff-cli-platform-ts`

Single entry point for all CLI communication.

Responsibilities:

- Implements a gRPC server exposing `BffCliPlatformService`
- Authenticates CLI requests via `module-iam-ts` using `Authorization: Bearer <token>` metadata
- Resolves authenticated `user_id` and injects `AuthContext` into outbound calls to `service-workflows-ts`
- Proxies unary calls to `service-workflows-ts`
- Verifies run ownership before returning workflow views or accepting answers
- Keeps no authoritative workflow state locally

Implementation notes:

- Use `nice-grpc`
- Follow repo TypeScript conventions with `neverthrow`
- Use `ts-pattern` when mapping errors to gRPC status codes

### Create `apps/cli-platform-ts`

TypeScript console application.

Responsibilities:

- Accepts `--login <email>` and `--password <password>` CLI arguments on startup
- Calls `Login` on startup and stores the session token in memory
- Sends session token as `Authorization: Bearer <token>` gRPC metadata on every call
- Supports `/workflows`, `/start`, `/attach`
- Renders persisted conversation messages
- Polls `GetWorkflowRunView` while a run is active
- Tracks the last rendered message id in memory
- On reconnect or restart, re-attaches by calling `GetWorkflowRunView` again

### Create `packages/contracts-cli-platform-proto`

Proto source for the CLI ↔ BFF interface.

### Create `packages/contracts-cli-platform-ts`

Generated TypeScript stubs from `contracts-cli-platform-proto`.

---

## Changes to Existing Packages and Apps

### `packages/contracts-workflows-proto`

Update the service contract to match the simplified model.

Required changes:

- Reserve `NODE_TYPE_ASK_QUESTION = 2`
- Add `GetWorkflowRunView` unary RPC
- Keep `ListWorkflows`, `StartWorkflow`, and `SubmitAnswer`
- Extend `StartWorkflowResponse` with `conversation_id`

`WorkflowsService` becomes:

```proto
service WorkflowsService {
  rpc ListWorkflows      (ListWorkflowsRequest)      returns (ListWorkflowsResponse);
  rpc StartWorkflow      (StartWorkflowRequest)      returns (StartWorkflowResponse);
  rpc GetWorkflowRunView (GetWorkflowRunViewRequest) returns (GetWorkflowRunViewResponse);
  rpc SubmitAnswer       (SubmitAnswerRequest)       returns (SubmitAnswerResponse);
}
```

### `apps/service-workflows-ts`

Extend the service from a pure workflow runner into the owner of persisted workflow interaction state.

Responsibilities added in this task:

- create a `conversation` when a workflow run starts
- persist `messages` for workflow-visible output and user answers
- persist `run_events` as a coarse execution journal
- persist `event_outbox` rows transactionally with domain changes
- publish internal events from the outbox to Redis Streams after commit
- serve `GetWorkflowRunView` from PostgreSQL-backed read models

`service-workflows-ts` remains the only writer to `platformik_workflows`.

---

## Data Model

All tables below live in `platformik_workflows`.

### Existing tables

Keep:

- `workflows`
- `workflow_runs`

Extend `workflow_runs` with:

- `conversation_id uuid NULL REFERENCES conversations(id)`
- `current_node_id text NULL`
- `status text NOT NULL`
- `revision bigint NOT NULL DEFAULT 0`
- `updated_at timestamptz NOT NULL DEFAULT now()`

`workflow_runs.revision` increments on every persisted state change that matters to clients.

### `conversations`

Product-facing interaction thread.

```sql
CREATE TABLE conversations (
  id          uuid PRIMARY KEY,
  user_id     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
```

Rules:

- In this task, one workflow run creates one conversation
- Reusing a conversation across multiple workflow runs is out of scope for this task

### `messages`

Persisted conversation history rendered by clients.

```sql
CREATE TABLE messages (
  id               uuid PRIMARY KEY,
  conversation_id  uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  run_id           uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  role             text NOT NULL CHECK (role IN ('user', 'system')),
  content          jsonb NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX messages_conversation_created_idx
  ON messages (conversation_id, id);
```

Rules:

- message order is defined by `id` (uuid7, monotonically increasing)
- messages are append-only in this task
- clients render messages ordered by `id`
- `messages` are the canonical product history for CLI and future clients

### `node_runs`

Execution state per workflow node.

```sql
CREATE TABLE node_runs (
  id            uuid PRIMARY KEY,
  run_id        uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  node_id       text NOT NULL,
  status        text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz
);

CREATE INDEX node_runs_run_node_idx
  ON node_runs (run_id, node_id);
```

Purpose:

- track node execution state independently from user-facing messages
- support retries, diagnostics, and future async execution

### `run_events`

Append-only coarse execution journal.

```sql
CREATE TABLE run_events (
  id         uuid PRIMARY KEY,
  run_id      uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  sequence    bigint NOT NULL,
  type        text NOT NULL,
  payload     jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, sequence)
);
```

Examples:

- `run_started`
- `node_entered`
- `message_created`
- `answer_received`
- `run_completed`
- `run_failed`

This table is for execution history, audit, and debugging. It is not the primary UI rendering source.

### `event_outbox`

Transactional outbox for the internal event bus.

```sql
CREATE TABLE event_outbox (
  id            uuid PRIMARY KEY,
  topic         text NOT NULL,
  payload       jsonb NOT NULL,
  attempts      integer NOT NULL DEFAULT 0,
  published_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX event_outbox_pending_idx
  ON event_outbox (published_at, created_at);
```

Purpose:

- prevent the DB-commit / Redis-publish gap
- allow retrying event publication after process crashes
- keep Redis out of the correctness path

### Message content model

`messages.content` stores a canonical JSON document that all clients render.

Envelope:

```json
{
  "version": 1,
  "type": "text",
  "content": {}
}
```

Supported V1 message types:

- `text`
- `option_input`
- `option_response`
- `status`
- `error`

Examples:

```json
{
  "version": 1,
  "type": "text",
  "content": {
    "text": "Hello from workflow"
  }
}
```

```json
{
  "version": 1,
  "type": "option_input",
  "content": {
    "label": "Choose an option",
    "selection_mode": "single",
    "options": [
      { "id": "a", "label": "Option A" },
      { "id": "b", "label": "Option B" }
    ]
  }
}
```

```json
{
  "version": 1,
  "type": "option_response",
  "content": {
    "selected": [{ "id": "b", "label": "Option B" }]
  }
}
```

Do not store client-specific presentation details in `content`.

---

## Proto Schema — `contracts-workflows-proto`

### New or updated unary RPCs

Add:

```proto
rpc GetWorkflowRunView (GetWorkflowRunViewRequest) returns (GetWorkflowRunViewResponse);
```

Request:

```proto
message GetWorkflowRunViewRequest {
  platformik.auth.v1.AuthContext auth = 1;
  string workflow_run_id = 2;
  string after_id = 3; // empty = full history; uuid7 = only messages after this id
}
```

Response:

```proto
message GetWorkflowRunViewResponse {
  string conversation_id = 1;
  WorkflowRunStatus status = 2;
  string current_node_id = 3;
  uint64 revision = 4;
  string last_message_id = 5;
  repeated ConversationMessage messages = 6;
  optional PendingInput pending_input = 7;
}
```

Shared messages:

```proto
message ConversationMessage {
  string id = 1;
  string conversation_id = 2;
  string run_id = 3;
  MessageRole role = 4;
  google.protobuf.Struct content = 5;
}

enum MessageRole {
  MESSAGE_ROLE_UNSPECIFIED = 0;
  MESSAGE_ROLE_USER = 1;
  MESSAGE_ROLE_SYSTEM = 2;
}

message PendingInput {
  oneof input {
    OptionInput option_input = 1;
  }
}

message OptionInput {
  string          label   = 1;
  repeated Option options = 2;
}

message Option {
  string id    = 1;
  string label = 2;
}
```

`StartWorkflowResponse` becomes:

```proto
message StartWorkflowResponse {
  string workflow_run_id = 1;
  string conversation_id = 2;
  string temporal_workflow_id = 3;
}
```

### `contracts-cli-platform-proto`

`BffCliPlatformService` should expose:

```proto
service BffCliPlatformService {
  rpc Login (LoginRequest) returns (LoginResponse);
  rpc ListWorkflows (ListWorkflowsRequest) returns (ListWorkflowsResponse);
  rpc StartWorkflow (StartWorkflowRequest) returns (StartWorkflowResponse);
  rpc GetWorkflowRunView (GetWorkflowRunViewRequest) returns (GetWorkflowRunViewResponse);
  rpc SubmitAnswer (SubmitAnswerRequest) returns (SubmitAnswerResponse);
}
```

There is no `WatchWorkflowRun` in this task.

---

## Internal Event Bus

### Transport

Use Redis Streams as an internal event bus only.

### Publication model

- `service-workflows-ts` writes domain state and `event_outbox` rows in one PostgreSQL transaction
- a dispatcher publishes pending rows to Redis Streams after commit
- after successful publish, the dispatcher marks the outbox row as published

### Delivery guarantees

- internal at-least-once delivery
- consumer groups are allowed
- event consumers must be idempotent

### Initial scope

The event bus is introduced now so the system is ready for future async consumers, but the core CLI path does
not depend on it for correctness.

Recommended initial event types:

- `workflow.run.started`
- `workflow.node.entered`
- `workflow.message.created`
- `workflow.answer.received`
- `workflow.run.completed`
- `workflow.run.failed`

### Correctness model

If Redis Streams are unavailable:

- workflow state in PostgreSQL remains correct
- CLI still works through unary calls
- unpublished outbox rows are retried later

---

## Auth and Security

### CLI authentication flow

1. CLI calls `Login(email, password)` on `bff-cli-platform-ts`
2. BFF delegates to `module-iam-ts`
3. On success, BFF returns a `session_token`
4. CLI stores the token in memory and sends it as `Authorization: Bearer <token>` metadata
5. BFF validates the token on every request and injects `AuthContext` into outbound calls

### Ownership verification

The BFF must verify that the requested `workflow_run_id` belongs to the authenticated user before:

- returning `GetWorkflowRunView`
- accepting `SubmitAnswer`

Verification flow:

1. Resolve `user_id` from session token
2. Call `GetWorkflowRunView` on `service-workflows-ts` with `AuthContext`
3. If not found or not owned by the user, return `PERMISSION_DENIED`
4. Only authorized users can read or mutate a workflow run

The CLI never has direct access to Redis or PostgreSQL.

---

## CLI UX Specification

### REPL model

The CLI presents a prompt (`> `) and accepts commands. Conversation messages are rendered from persisted
history.

### Commands

| Command                     | Description                                 |
| --------------------------- | ------------------------------------------- |
| `/workflows`                | List all available workflows                |
| `/start <workflow-id>`      | Start a workflow run and enter polling mode |
| `/attach <workflow-run-id>` | Load an existing run and enter polling mode |

There is no `/quit` command. The user exits with `Ctrl+C`.

### Attach flow

`/start` and `/attach` follow the same pattern:

1. Call `GetWorkflowRunView` with `after_id = ""`
2. Render returned `messages`
3. Render `pending_input` if present
4. If the run is active and waiting on the system, poll again after a short interval

### Polling contract

While a run is active, the CLI polls:

```text
GetWorkflowRunView(workflow_run_id, after_id = last_message_id)
```

The client stores:

- active `workflow_run_id`
- `last_message_id`
- `last_run_revision`

The client renders:

- only newly returned messages
- updated pending input when `revision` changes
- completion or failure once the run status changes

### Rendering rules

The CLI renders from `messages.content.type`:

| Message type      | CLI behaviour                             |
| ----------------- | ----------------------------------------- |
| `text`            | Print text                                |
| `option_input`    | Print numbered options and wait for input |
| `option_response` | Print the selected option                 |
| `status`          | Print only if useful for the operator     |
| `error`           | Print the error clearly                   |

The CLI does not render from `NodeType` directly.

### Submit flow

When the user selects an option:

1. CLI calls `SubmitAnswer`
2. `service-workflows-ts` persists the user answer as a `messages` row with `role=user`
3. `service-workflows-ts` advances the run
4. CLI resumes polling

The client must not invent local-only messages that do not exist in PostgreSQL.

### Disconnect handling

If the CLI crashes or loses network:

1. reconnect
2. call `GetWorkflowRunView(workflow_run_id, after_id = "")`
3. render the persisted state again
4. continue polling if the run is still active

There is no special resume cursor beyond persisted `id` and `revision`.

---

## Fault Tolerance

### Service crash after DB commit

The transactional outbox removes the DB-commit / Redis-publish gap:

- if `service-workflows-ts` crashes after commit, the outbox row remains pending
- the dispatcher retries publication later
- even if event publication is delayed, `GetWorkflowRunView` still returns correct persisted state

### BFF crash or network disconnect

If the BFF or client disconnects:

- no client events are lost because the client relies on persisted state, not on a transient stream
- client reconnects through `GetWorkflowRunView`
- client resumes from the latest persisted state

### Event bus failure

If the internal event bus is unavailable:

- workflow correctness is preserved by PostgreSQL and Temporal
- async consumers may lag
- outbox rows accumulate and publish later

### No event sourcing in this task

This task does not implement event sourcing.

Reasons:

- PostgreSQL tables already store the canonical current state and product history
- Temporal already stores orchestration history for workflow execution
- CLI correctness does not require reconstructing state from events
- the internal event bus is for async delivery, not as a state store

---

## Out of Scope

The following are out of scope for this task:

- AI provider integration
- token streaming
- SSE or WebSocket delivery
- web UI changes
- native client implementation
- Telegram or webhook trigger implementation
- attachments, blobs, and provider-specific raw payload storage
- conversation reuse across multiple workflow runs

The plan intentionally keeps the implementation narrow so the first TypeScript CLI + Temporal workflow path is
simple and correct.

---

## Implementation Order

### Step 1 — Update `packages/contracts-workflows-proto` and regenerate `packages/contracts-workflows-ts`

- Add `GetWorkflowRunView`
- Add conversation message transport types
- Extend `StartWorkflowResponse` with `conversation_id`
- Regenerate `packages/contracts-workflows-ts`
- Validate:
  - `moon run contracts-workflows-proto:validate`
  - `moon run contracts-workflows-ts:validate`
  - `moon run service-workflows-ts:validate`

### Step 2 — Create `packages/contracts-cli-platform-proto` and `packages/contracts-cli-platform-ts`

- Define `Login`
- Reuse workflow unary request/response types from `contracts-workflows-proto`
- Generate `packages/contracts-cli-platform-ts`
- Validate:
  - `moon run contracts-cli-platform-proto:validate`
  - `moon run contracts-cli-platform-ts:validate`

### Step 3 — Add workflow interaction schema to `packages/module-workflows-ts`

- Add `conversations`
- Add `messages`
- Add `node_runs`
- Add `run_events`
- Add `event_outbox`
- Extend `workflow_runs` with `conversation_id`, `current_node_id`, `revision`, `updated_at`
- Generate all new entity IDs as `UUIDv7` in application code before inserting rows
- Export any new public contracts required by `service-workflows-ts`
- Validate:
  - `moon run module-workflows-ts:validate`

### Step 4 — Extend `apps/service-workflows-ts`

- Persist conversation state and run history in PostgreSQL
- Implement `GetWorkflowRunView`
- Create a conversation on workflow start
- Persist user answers as messages
- Persist run events
- Write outbox rows transactionally with domain updates
- Add an outbox dispatcher that publishes to Redis Streams
- Validate:
  - `moon run service-workflows-ts:fix`
  - `moon run service-workflows-ts:validate`

### Step 5 — Create `apps/bff-cli-platform-ts`

- Implement `Login`
- Proxy `ListWorkflows`, `StartWorkflow`, `GetWorkflowRunView`, `SubmitAnswer`
- Verify ownership before returning run views or accepting answers
- Map typed errors to gRPC statuses
- Validate:
  - `moon run bff-cli-platform-ts:fix`
  - `moon run bff-cli-platform-ts:validate`

### Step 6 — Create `apps/cli-platform-ts`

- Implement login flow
- Implement REPL commands `/workflows`, `/start`, `/attach`
- Render conversation messages from `GetWorkflowRunView`
- Poll while the run is active
- Track `last_message_id` and `last_run_revision`
- Resume by reloading the persisted state
- Validate:
  - `moon run cli-platform-ts:fix`
  - `moon run cli-platform-ts:validate`

### Step 7 — Integration smoke test

- Start PostgreSQL, Redis, `service-workflows-ts`, and `bff-cli-platform-ts`
- Run `apps/cli-platform-ts --login <email> --password <pass>`
- Verify:
  - login succeeds with seeded dev credentials
  - `/workflows` returns seeded workflows
  - `/start <id>` creates a run and conversation
  - initial messages and pending input render correctly
  - `SubmitAnswer` persists a user message and advances the run
  - `/attach <workflow-run-id>` renders the latest persisted state
  - CLI can exit and later resume by polling the same run
  - Redis Streams can be stopped temporarily without corrupting workflow state
  - a different user cannot attach to another user's run

---

## Key Invariants

| Invariant                                         | Enforced by                                                     |
| ------------------------------------------------- | --------------------------------------------------------------- |
| PostgreSQL is the source of truth                 | `service-workflows-ts` persisted read models                    |
| Redis is not a client transport                   | no `WatchWorkflowRun`, no SSE/WebSocket in this task            |
| Conversation history is product-facing state      | `messages` table                                                |
| Execution history is not the UI timeline          | `run_events` table                                              |
| Message ordering is deterministic                 | `messages.id` (uuid7)                                           |
| All workflow-domain entity IDs are `UUIDv7`       | IDs generated in application code before DB writes              |
| One run maps to one conversation in this task     | conversation created at `StartWorkflow`                         |
| Client reconnect depends only on persisted state  | `GetWorkflowRunView` polling                                    |
| No DB-commit / Redis-publish event loss gap       | `event_outbox`                                                  |
| Internal async consumers are decoupled from CLI   | Redis Streams internal event bus                                |
| Workflow correctness does not depend on event bus | PostgreSQL + Temporal                                           |
| No event sourcing                                 | current-state tables + execution journal, not state-from-events |
