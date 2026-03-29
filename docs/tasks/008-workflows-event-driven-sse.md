# 008 — Replace Workflow SSE Polling with Event-Driven Redis Streams

## Before You Start

- Read `AGENTS.md` for mandatory validation, tooling, and documentation rules.
- Read `docs/architecture/boundaries.md` before changing app/package dependencies.
- Read `docs/stacks/typescript.md` before writing any TypeScript.
- Follow repo TypeScript conventions: `neverthrow` for expected failures, `ts-pattern` at transport
  boundaries.

---

## Context

Current SSE implementation in `apps/api-platform-ts/src/routes/workflows.ts` uses server-side polling:

- every second `api-platform-ts` calls `GetWorkflowRunView` on `service-workflows-ts`;
- each active SSE connection creates recurring gRPC load;
- this does not scale for production concurrency.

The repo already has internal event bus foundations:

- `service-workflows-ts` writes outbox rows and publishes to Redis Streams;
- topics already emitted include:
  - `workflow.run.started`
  - `workflow.message.created`
  - `workflow.answer.received`
  - `workflow.run.completed`

Gap to close: `api-platform-ts` still polls instead of consuming Redis events, and failure flow is incomplete
(`workflow.run.failed` is missing).

---

## Goal

Implement end-to-end event-driven live updates for workflow runs:

1. `service-workflows-ts` emits workflow progress events to Redis Streams (including failed terminal state).
2. `api-platform-ts` subscribes to Redis Streams and uses events as triggers.
3. `api-platform-ts` pushes updates to SSE clients without periodic polling loops.
4. `cli-platform-ts` stops fallback polling and relies on SSE + reconnect.
5. Keep HTTP/SSE public API unchanged.

---

## Locked Architecture Decisions

- Event payload strategy: **thin event + hydrate**.
- Redis consume model: **per-instance tail read (`XREAD`)** (no consumer groups).
- Failure mode when Redis is unavailable: **strict no-polling fallback**.
- Include failed-path in this task: **yes**.
- Remove CLI safety polling in this task: **yes**.
- Outbox publish latency cap: **max 1s**.

---

## Required Changes

### 1) `apps/service-workflows-ts`

Implement explicit run failure lifecycle and event emission.

- Add run failure persistence path in workflows module/repository:
  - update `workflow_runs.status = 'failed'`;
  - set terminal timestamps;
  - increment `revision`.
- Emit run failure artifacts:
  - `run_events` entry (type: `run_failed`);
  - outbox entry topic: `workflow.run.failed`.
- Ensure failure path is triggered on unhandled workflow execution errors.
- Keep outbox delivery at-least-once semantics.
- Reduce outbox dispatcher idle backoff:
  - cap polling interval at `1000ms` (remove long idle delay behavior).

`workflow.run.failed` payload must include:

- `runId` (required),
- `errorMessage` (required string).

---

### 2) `apps/api-platform-ts`

Replace SSE polling loop with Redis-triggered hydrate flow.

#### Container/runtime

- Add Redis dependency and runtime wiring in container lifecycle.
- Add `WORKFLOWS_REDIS_URL` to app config schema.
- Close Redis connections in `onClose` hooks.

#### Redis stream listener

- Subscribe to topics:
  - `workflow.run.started`
  - `workflow.message.created`
  - `workflow.answer.received`
  - `workflow.run.completed`
  - `workflow.run.failed`
- Read with `XREAD BLOCK` in a continuous loop.
- Start cursor at `$` (new events only).
- Parse `payload` JSON and extract `runId`.
- Maintain in-memory notifier keyed by `runId` for active local SSE connections.
- Handle duplicates and at-least-once delivery safely by relying on DB hydrate + per-connection dedupe.
- If Redis listener becomes unavailable, mark event bus as not ready.

#### SSE route behavior

For `/api/v1/workflows/runs/:id/events`:

- Keep existing auth and `Accept: text/event-stream` checks.
- On connect:
  - perform one initial hydrate via `GetWorkflowRunView` (`afterId` from query if provided);
  - emit `message`, `status`, `pending_input` deltas from that snapshot.
- After initial hydrate:
  - wait for run-specific Redis trigger;
  - on trigger, call `GetWorkflowRunView` with current `lastMessageId`;
  - emit only deltas.
- Keep heartbeat SSE event (no gRPC polling).
- Terminal behavior:
  - when run status becomes `completed` or `failed`, emit terminal `status`, clear `pending_input` if needed,
    close stream.
- Strict no-polling failure behavior:
  - if event bus is not ready before opening stream, return `503` JSON error;
  - if bus fails during stream, emit SSE `error` and close stream.

Public SSE event types remain unchanged:

- `message`
- `status`
- `pending_input`
- `heartbeat`
- `error`

---

### 3) `apps/cli-platform-ts`

Remove safety polling from run hook.

- Delete periodic `getWorkflowRunView` interval fallback in `use-run.ts`.
- Keep SSE subscription/reconnect behavior.
- Keep message dedupe logic.

---

### 4) Documentation

Update architecture docs to match implementation:

- `docs/architecture/overview.md`:
  - confirm no polling in SSE flow;
  - document Redis-triggered hydrate model;
  - include failed-event path.

---

## Non-Goals

- No consumer groups or sticky-load-balancer requirements.
- No direct SSE-ready rich payloads in Redis.
- No WebSocket introduction.
- No event sourcing migration.

---

## Acceptance Criteria

1. `api-platform-ts` no longer calls `GetWorkflowRunView` on a fixed interval inside SSE streaming.
2. Live updates are triggered by Redis stream events.
3. Workflow failures produce:
   - DB status `failed`,
   - `run_events` entry,
   - `workflow.run.failed` outbox/Redis event,
   - SSE `status` with failed terminal state.
4. With Redis unavailable, SSE route does not degrade to polling.
5. CLI run UI has no background fallback polling loop.
6. Architecture docs describe the implemented event-driven behavior.

---

## Test Scenarios

### Service workflows

- Workflow happy path emits existing topics and still completes correctly.
- Workflow failure path sets run to `failed` and emits `workflow.run.failed`.
- Outbox dispatcher still retries publish failures and keeps at-least-once behavior.

### API platform SSE

- Initial SSE connect returns snapshot deltas correctly.
- Redis `workflow.message.created` trigger causes message emission without polling loop.
- Duplicate Redis events do not duplicate SSE messages.
- `workflow.run.completed` and `workflow.run.failed` terminate stream correctly.
- Redis unavailable at connect -> `503`.
- Redis failure during stream -> SSE `error` then close.

### CLI

- Run view state updates from SSE only.
- No periodic fallback `getWorkflowRunView` calls remain.
