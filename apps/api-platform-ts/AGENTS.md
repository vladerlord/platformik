# Agent instructions for `apps/api-platform-ts`

## Role

- `api-platform-ts` is a public API transport and orchestration app.
- Follow `docs/architecture/boundaries.md` for placement of business capabilities in `packages/module-*` and
  separate runtimes or language stacks in `apps/service-*`.

## Structure

- `bin/`
  - Process entrypoints.
- `src/container.ts`
  - Composition root for the app.
  - Dependency wiring, route and plugin registration, and lifecycle hooks.
- `src/config/`
  - Environment parsing and config resolution.
- `src/api/`
  - Public API transport layer.
  - Directory structure that mirrors the public API path up to the resource boundary.
  - Each public API resource subtree uses one `<resource>.ts` transport entrypoint, even when that subtree
    includes multiple endpoints or transport styles such as SSE.
  - Sibling `<resource>.types.ts` files for Zod schemas and related inferred types for that resource.
  - Request/reply handling, validation, serialization, transport-local mapping, and SSE response handling.
- `src/application/`
  - App-local application orchestration and composition layer.
  - Capability or use-case oriented structure, not upstream app or service names.
  - Coordination specific to this app and capability, not domain ownership.
  - State tracking, event or delta generation, stream coordination, polling or subscription loops, response
    aggregation, and composition of module or service calls for one API capability.
- `src/ops/`
  - Shared technical operations and integrations used across multiple API resources or application
    capabilities.
  - HTTP infrastructure, event bus integration, upstream clients, and similar cross-cutting technical helpers.
