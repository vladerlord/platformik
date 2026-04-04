# worker — Implementation Plan

## Before you start

Read these files in order — they contain mandatory rules:

1. `AGENTS.md` — validation loop, tooling, naming rules
2. `docs/architecture/boundaries.md` — monorepo architecture policy
3. `docs/stacks/typescript.md` — TypeScript stack conventions

Before writing any code also read `packages/module-iam-ts` in full — it is the canonical example of the module
pattern used in this monorepo: `src/module.ts`, `src/contracts.ts`, `src/migrations/`.

Do not write any code until you have read all of the above.

## Context

`apps/service-ai-py` contains a working Temporal.io implementation (Python) used for testing:
`src/platformik_service_ai/temporal/` — `workflow.py`, `activities.py`, `types.py`.

This serves as a **conceptual reference** — the same node types, signals, queries, and business logic apply
here, but the implementation is a TypeScript rewrite using the Temporal TypeScript SDK. Do not copy Python
code. `apps/service-ai-py` is left untouched and will be removed manually later.

`packages/contracts-auth-proto/src/auth_context.proto` already defines `AuthContext`, `ServiceActor`, and
`UserSubject`. Every gRPC request must include `AuthContext`. `UserSubject.user_id` is the foreign key used to
scope data per user.

`docker/postgres/init/01-create-databases.sql` already has `CREATE DATABASE platformik_workflows;`.

## What is being built

Two new packages and one app:

- `packages/contracts-workflows-proto` — gRPC interface source of truth (proto file)
- `packages/contracts-workflows-ts` — generated TypeScript types + nice-grpc service definition
- `packages/module-workflows-ts` — business module: DB schema, queries, migrations, domain types
- `apps/worker` — gRPC server + Temporal worker + activities + composition root

**Responsibility split:**

| Concern                         | Owner                       |
| ------------------------------- | --------------------------- |
| gRPC interface definition       | `contracts-workflows-proto` |
| Generated gRPC TypeScript types | `contracts-workflows-ts`    |
| DB schema, queries, migrations  | `module-workflows-ts`       |
| Domain types (public contracts) | `module-workflows-ts`       |
| Temporal workflow + activities  | `apps/worker`               |
| gRPC server + servicer          | `apps/worker`               |
| Process wiring + lifecycle      | `apps/worker`               |

## Stack

- **gRPC server**: `nice-grpc` + `@grpc/grpc-js`
- **Proto codegen**: `ts-proto` (generates TypeScript types + nice-grpc service definitions)
- **DB driver**: `pg` (node-postgres, via Kysely dialect)
- **Query builder**: `kysely` — type-safe, no ORM, no model classes
- **Migrations**: Kysely `Migrator` (same pattern as `module-iam-ts`)
- **Workflow orchestration**: `@temporalio/client`, `@temporalio/worker`, `@temporalio/workflow`,
  `@temporalio/activity`
- **UUID7**: `uuidv7`
- **Error handling**: `neverthrow` (`Result` / `ResultAsync`) — mandatory per `docs/stacks/typescript.md`
- **Error matching**: `ts-pattern` — use at the top of call chains to map errors to gRPC status codes

### Dependency installation

Never guess versions. For every new dependency:

1. `pnpm view <pkg> dist-tags.latest` → get `X.Y.Z`
2. Add `<pkg>: ^X.Y.Z` to the `catalog:` section in `pnpm-workspace.yaml`
3. Reference as `"catalog:"` in every `package.json` that uses it

---

## Artifact 1: `packages/contracts-workflows-proto`

### Purpose

Source of truth for the gRPC interface. Per `docs/architecture/boundaries.md`, generated artifacts always land
in dedicated `contracts-<name>-<lang>` packages — never in `apps/`.

### `packages/contracts-workflows-proto/moon.yml`

Follow the same pattern as `packages/contracts-auth-proto/moon.yml` — a schema package with no inherited
tasks.

### `packages/contracts-workflows-proto/src/workflows.proto`

```proto
syntax = "proto3";

package platformik.workflows.v1;

import "auth_context.proto";

// ── Shared domain types ────────────────────────────────────────────────────

message WorkflowSummary {
  string id    = 1; // uuid7
  string title = 2;
}

enum NodeType {
  NODE_TYPE_UNSPECIFIED      = 0;
  NODE_TYPE_START            = 1;
  reserved 2;
  reserved "NODE_TYPE_ASK_QUESTION";
  NODE_TYPE_OPTION_SELECTION = 3;
  NODE_TYPE_SEND_MESSAGE     = 4;
  NODE_TYPE_END              = 5;
}

enum WorkflowRunStatus {
  WORKFLOW_RUN_STATUS_UNSPECIFIED = 0;
  WORKFLOW_RUN_STATUS_RUNNING     = 1;
  WORKFLOW_RUN_STATUS_COMPLETED   = 2;
  WORKFLOW_RUN_STATUS_FAILED      = 3;
}

// ── ListWorkflows ──────────────────────────────────────────────────────────

message ListWorkflowsRequest {
  platformik.auth.v1.AuthContext auth = 1;
}

message ListWorkflowsResponse {
  repeated WorkflowSummary workflows = 1;
}

// ── StartWorkflow ──────────────────────────────────────────────────────────

message StartWorkflowRequest {
  platformik.auth.v1.AuthContext auth        = 1;
  string                         workflow_id = 2; // uuid7, references workflows table
}

message StartWorkflowResponse {
  string workflow_run_id      = 1; // uuid7, inserted into workflow_runs table
  string temporal_workflow_id = 2;
}

// ── GetWorkflowState ───────────────────────────────────────────────────────

message GetWorkflowStateRequest {
  platformik.auth.v1.AuthContext auth            = 1;
  string                         workflow_run_id = 2;
}

message GetWorkflowStateResponse {
  WorkflowRunStatus status             = 1;
  NodeType          current_node_type  = 2;
  optional string   pending_question   = 3;
  repeated string   pending_options    = 4;
  repeated string   delivered_messages = 5;
  bool              completed          = 6;
}

// ── SubmitAnswer ───────────────────────────────────────────────────────────

message SelectOptionAnswer {
  string value = 1; // option label or 1-based index as string
}

message SubmitAnswerRequest {
  platformik.auth.v1.AuthContext auth            = 1;
  string                         workflow_run_id = 2;
  reserved 4, 5;
  reserved "text_input", "number_input";
  oneof answer {
    SelectOptionAnswer select_option = 3;
  }
}

message SubmitAnswerResponse {}

// ── Service ────────────────────────────────────────────────────────────────

service WorkflowsService {
  rpc ListWorkflows    (ListWorkflowsRequest)    returns (ListWorkflowsResponse);
  rpc StartWorkflow    (StartWorkflowRequest)    returns (StartWorkflowResponse);
  rpc GetWorkflowState (GetWorkflowStateRequest) returns (GetWorkflowStateResponse);
  rpc SubmitAnswer     (SubmitAnswerRequest)      returns (SubmitAnswerResponse);
}
```

---

## Artifact 2: `packages/contracts-workflows-ts`

Package name: `@platformik/contracts-workflows`.

### Purpose

Generated TypeScript types and `nice-grpc` service definition. Used by `apps/worker` as the gRPC server
implementation base, and by future `apps/cli-test-workflows-ts` as the gRPC client.

### Codegen

Add `ts-proto` and `grpc-tools` as dev dependencies. Generate stubs with `protoc`, pointing `-I` at both proto
source directories (`packages/contracts-workflows-proto/src` and `packages/contracts-auth-proto/src`).
Configure `ts-proto` options for `nice-grpc`:

```
--ts_proto_opt=outputServices=nice-grpc,outputServices=generic-definitions,useExactTypes=false
```

Output goes into `packages/contracts-workflows-ts/src/generated/`. Commit the generated files. Add a
`generate` task in `moon.yml` that re-runs this command.

### Exports

`package.json` exports field:

- `"."` → `src/index.ts` — re-exports everything from `src/generated/`

---

## Artifact 3: `packages/module-workflows-ts`

Package name: `@platformik/module-workflows`.

Follow `packages/module-iam-ts` as the canonical example for structure, contracts pattern, and migration
exports.

### Directory structure

```
packages/module-workflows-ts/
  src/
    module.ts          # createWorkflowsModule factory + re-exports workflowsMigrations
    contracts.ts       # all public types, module interface, deps interface, migrations type
    db/
      schema.ts        # Kysely WorkflowsDatabase interface (internal)
      queries.ts       # query functions (internal)
    migrations/
      index.ts         # workflowsMigrations export
      0001_initial.ts  # DDL: creates workflows and workflow_runs tables
  package.json
  tsconfig.json
  moon.yml
```

### `packages/module-workflows-ts/src/contracts.ts`

Defines all public types. Follow the `module-iam-ts` contracts pattern — tagged error unions, `Result` return
types, module interface, deps interface, and the migrations type.

**Domain types:**

- `NodeType` — `'start' | 'option_selection' | 'send_message' | 'end'`
- `FlowNodeOption` — `{ label: string; nextNodeId: string }`
- `FlowNode` — `{ id, type: NodeType, nextNodeId?, question?, answerKey?, messageTemplate?, options }`
- `FlowDefinition` — `{ version, startNodeId, nodes: FlowNode[] }`
- `WorkflowSummary` — `{ id, title }`
- `WorkflowRunStatus` — `'running' | 'completed' | 'failed'`
- `WorkflowRunRow` — `{ id, workflowId, userId, temporalWorkflowId, status, startedAt, completedAt, result }`
- `InteractiveFlowState` — `{ pendingQuestion, pendingOptions, deliveredMessages, awaitingAnswer, completed }`

**Error types** — tagged union, e.g. `WorkflowsError`:

- `{ type: 'workflow_not_found' }`
- `{ type: 'workflow_run_not_found' }`
- `{ type: 'db_error'; cause: unknown }`

**Module interface** `WorkflowsModule`:

- `listWorkflows(userId: string): ResultAsync<WorkflowSummary[], WorkflowsError>`
- `getWorkflowSchema(workflowId: string): ResultAsync<FlowDefinition, WorkflowsError>`
- `insertWorkflowRun(params: { workflowId, userId, temporalWorkflowId }): ResultAsync<string, WorkflowsError>`
- `getWorkflowRun(runId: string): ResultAsync<WorkflowRunRow, WorkflowsError>`
- `completeWorkflowRun(runId: string, result: unknown): ResultAsync<void, WorkflowsError>`

**Deps interface** `WorkflowsModuleDeps`:

- `db: Kysely<WorkflowsDatabase>`

**Migrations type** `WorkflowsMigrations<TDb>` — same shape as `IamMigrations` in `module-iam-ts`.

### `packages/module-workflows-ts/src/db/schema.ts`

PostgreSQL schema for two tables:

**`workflows` table**

| Column       | PG type       | Notes                           |
| ------------ | ------------- | ------------------------------- |
| `id`         | `uuid`        | uuid7, generated at insert time |
| `user_id`    | `text`        | from `UserSubject.user_id`      |
| `title`      | `text`        | not null                        |
| `schema`     | `jsonb`       | serialised `FlowDefinition`     |
| `created_at` | `timestamptz` | server default `now()`          |

**`workflow_runs` table**

| Column                 | PG type       | Notes                                        |
| ---------------------- | ------------- | -------------------------------------------- |
| `id`                   | `uuid`        | uuid7                                        |
| `workflow_id`          | `uuid`        | references `workflows.id`                    |
| `user_id`              | `text`        | denormalised for query convenience           |
| `temporal_workflow_id` | `text`        | used to look up live state in Temporal       |
| `status`               | `text`        | `running` \| `completed` \| `failed`         |
| `started_at`           | `timestamptz` | server default `now()`                       |
| `completed_at`         | `timestamptz` | nullable, set when run finishes              |
| `result`               | `jsonb`       | nullable, final answers + delivered messages |

### `packages/module-workflows-ts/src/db/queries.ts`

Internal query functions accepting `Kysely<WorkflowsDatabase>`. Return `ResultAsync`. Not exported outside the
module — only used inside `module.ts` factory.

### `packages/module-workflows-ts/src/migrations/0001_initial.ts`

Creates `workflows` and `workflow_runs` tables as described above.

### `packages/module-workflows-ts/src/migrations/index.ts`

Exports `workflowsMigrations: WorkflowsMigrations<WorkflowsDatabase>` — a record keyed by migration name. Same
pattern as `packages/module-iam-ts/src/migrations/index.ts`.

### `packages/module-workflows-ts/src/module.ts`

Exports `createWorkflowsModule(deps: WorkflowsModuleDeps): WorkflowsModule` factory and re-exports
`workflowsMigrations`. Same pattern as `packages/module-iam-ts/src/module.ts`.

### `package.json` exports

```json
{
  ".": "./src/module.ts",
  "./contracts": "./src/contracts.ts"
}
```

---

## Artifact 4: `apps/worker`

Package name: `@platformik/service-workflows`.

This is the composition root. It wires infrastructure (Kysely, Temporal client), runs migrations, creates the
module, and starts the gRPC server and Temporal worker.

### Directory structure

```
apps/worker/
  src/
    index.ts           # entry point: runs migrations, then gRPC server + Temporal worker concurrently
    config.ts          # Config interface + load()
    container.ts       # Container interface + build() + close()
    seed.ts            # dev-only seed script — inserts fixture workflows into DB
    grpc/
      server.ts        # nice-grpc server setup and lifecycle
      service.ts       # WorkflowsService implementation — all four RPCs
    temporal/
      workflow.ts      # interactiveDslWorkflow — TS rewrite of Python reference
      activities.ts    # deliverMessage activity
      nodes/           # split node handlers here when workflow switch grows large
  package.json
  tsconfig.json
  moon.yml
```

No `db/` or `migrations/` in the app — those live in `module-workflows-ts`.

### `config.ts`

`Config` is a plain interface. `load()` reads from environment variables. Required variables:

| Variable              | Description                                                        |
| --------------------- | ------------------------------------------------------------------ |
| `TEMPORAL_ADDRESS`    | e.g. `localhost:7233`                                              |
| `TEMPORAL_NAMESPACE`  | e.g. `default`                                                     |
| `TEMPORAL_TASK_QUEUE` | e.g. `workflows`                                                   |
| `DATABASE_URL`        | PostgreSQL URL: `postgresql://user:pass@host/platformik_workflows` |
| `GRPC_PORT`           | e.g. `50051`                                                       |

### `container.ts`

`Container` holds:

- `temporalClient: Client` — from `@temporalio/client`
- `db: Kysely<WorkflowsDatabase>` — configured with `PostgresDialect` + `pg` pool
- `workflows: WorkflowsModule` — created via `createWorkflowsModule({ db })`

`build(config)` creates all three in order. `close()` shuts down the Temporal client and destroys the Kysely
pool.

### `index.ts`

Lifecycle:

1. `load()` — read config
2. Create a temporary `Kysely` instance, run `workflowsMigrations` via Kysely `Migrator.migrateToLatest()`,
   then destroy it
3. `build(config)` — create container
4. Start `nice-grpc` server on `config.grpcPort`, register `WorkflowsService` implementation (passing
   `container`)
5. Create `Worker` from `@temporalio/worker`:
   - `workflowsPath`: `new URL('./temporal/workflow.ts', import.meta.url).pathname`
   - `activities`: import from `./temporal/activities.ts`
   - `taskQueue`: `config.temporalTaskQueue`
   - `client`: `container.temporalClient`
6. `await Promise.all([server.start(), worker.run()])`
7. On `SIGTERM` / `SIGINT`: graceful shutdown — stop server, shutdown worker, `container.close()`

### `grpc/service.ts`

Implements the four RPCs. Receives `Container` via constructor. Use `ts-pattern` at the top of each RPC to
exhaustively map `WorkflowsError` variants to gRPC `ServerError` with appropriate `Status` codes.

**`listWorkflows`** — calls `container.workflows.listWorkflows(auth.subject.userId)`, returns
`{ workflows: [...] }`.

**`startWorkflow`**:

1. Call `container.workflows.getWorkflowSchema(workflowId)` to verify it exists and load definition
2. Generate a uuid7 for `workflowRunId`
3. Start Temporal workflow `interactiveDslWorkflow` — use `workflowRunId` as Temporal workflow ID (1:1
   traceability), pass `FlowDefinition` as input
4. Call `container.workflows.insertWorkflowRun({ workflowId, userId, temporalWorkflowId: workflowRunId })`
5. Return `{ workflowRunId, temporalWorkflowId: workflowRunId }`

**`getWorkflowState`**:

- Call `container.workflows.getWorkflowRun(workflowRunId)` to get `temporalWorkflowId` and `status`
- If `status === 'running'`: get workflow handle via `temporalClient`, call Temporal query `workflowState`,
  map `InteractiveFlowState` → `GetWorkflowStateResponse`
- If `status === 'completed'` or `'failed'`: return status from DB (no Temporal call)

**`submitAnswer`**:

- Call `container.workflows.getWorkflowRun(workflowRunId)` to get `temporalWorkflowId`
- Extract string value from the `oneof answer` field
- Get workflow handle, send Temporal signal `submitAnswer(value)`
- Return `{}`

### `temporal/workflow.ts`

TypeScript rewrite of the Python `InteractiveDslWorkflow`. Same business logic, same nodes. Import domain
types (`FlowDefinition`, `FlowNode`, `NodeType`, `InteractiveFlowState`) from
`@platformik/module-workflows/contracts`.

Temporal TypeScript SDK API:

- `defineSignal<[string]>('submitAnswer')` — answer signal
- `defineQuery<InteractiveFlowState>('workflowState')` — state query
- `setHandler()` — register signal and query handlers
- `condition()` — wait for an answer
- `proxyActivities<typeof activities>({ scheduleToCloseTimeout: '10s' })` — activity calls

If the node-type switch grows beyond ~5 branches, split each handler into a separate function in
`temporal/nodes/<type>.ts`.

### `temporal/activities.ts`

`deliverMessage(message: string): Promise<string>` — logs and returns the message.

### `moon.yml`

```yaml
id: worker
language: typescript
layer: application
```

Tasks:

- `server` task — runs `tsx src/index.ts` (persistent, not cached, not CI)
- `seed` task — runs `tsx src/seed.ts` (not cached, not CI, not persistent — run manually once after first
  migrate)
- `generate` task — delegates to `contracts-workflows-ts:generate`

---

## Validation

After implementation run:

```
moon run tooling-content:format-fix
moon run tooling-content:validate
moon run contracts-workflows-ts:fix
moon run contracts-workflows-ts:validate
moon run module-workflows-ts:fix
moon run module-workflows-ts:validate
moon run worker:fix
moon run worker:validate
```

---

## Out of scope

- `apps/cli-test-workflows-ts` — next iteration (TUI gRPC client)
- Removing Temporal from `apps/service-ai-py`
- Communication with other services
- Automatic tests
