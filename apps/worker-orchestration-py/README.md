# `apps/worker-orchestration-py`

Deployable Temporal worker for running workflow executions (activities + orchestration glue).

Composition root responsibilities (apps only):

- Instantiate Temporal client/worker.
- Configure task queues, concurrency, budgets/guardrails.
- Wire node implementations (LLM/Tool/MemoryRead/ValidateAndCommit/etc.).

No code yet (scaffolding phase).
