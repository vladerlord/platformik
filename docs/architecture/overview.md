# Architecture Overview

## Overview

The monorepo uses a layered architecture with synchronous request handling and asynchronous event delivery.

Runtime roles:

- **client apps** — `cli-platform-ts`, `web-platform-ts`;
- `api-platform-ts` — public entrypoints for client-facing HTTP APIs and SSE streams;
- `service-*` — private backend services that implement domain capabilities;
- event bus — asynchronous event transport implemented with Redis Streams;
- stateful infrastructure — databases, caches, and workflow/runtime systems.

For monorepo naming, package roles, and source-level dependency rules, see `docs/architecture/boundaries.md`.

## Communication

- Client apps communicate with API apps over **HTTP**.
- `api-platform-ts` send live updates to clients over **SSE**.
- Internal synchronous communication uses **gRPC**.
- Internal services may publish domain events to the **event bus**.
- API apps may consume event bus events and translate them into SSE updates for connected clients.
- Clients never consume internal events directly.

## Invariants

- Client apps never communicate directly with internal services.
- `api-platform-ts` is the only public entrypoints for client-facing HTTP and SSE communication.
- gRPC is used for synchronous internal service-to-service communication.
- The event bus is used for asynchronous cross-component event delivery.
- SSE is produced by API apps, not by internal services directly.
- Redis Streams is an internal transport implementation detail of the event bus.
