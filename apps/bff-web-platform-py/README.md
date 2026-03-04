# `apps/bff-web-platform-py`

Deployable BFF (presentation layer / API gateway) for the web client.

Composition root responsibilities (apps only):

- Instantiate DB/queue/cache/LLM clients.
- Wire implementations into package “ports”.
- Expose HTTP/WebSocket APIs.

No code yet (scaffolding phase).
