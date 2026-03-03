# Workflow spec (draft)

This is the product-facing draft of the workflow format. Implementation comes later.

## High-level shape

A workflow spec is a declarative document describing:

- `nodes`: typed nodes with parameters
- `edges`: connections between nodes (including branch labels)
- `inputs`/`outputs`: (optional) contract for outer integration
- `subflows`: reusable workflow fragments (templates)

## Node execution contract (planned)

Every node execution produces:

- `outputs`: typed JSON result
- `logs`: structured logs for UI trace view
- `metrics`: token usage / estimated cost / timing
- `proposed_memory_patch` (optional): strict JSON patch proposal for canonical memory

## MVP node types

1. Trigger (cron/manual)
2. LLM (schema-bound output; optional tool calls)
3. Tool (HTTP/custom function)
4. StaticIf (deterministic expressions)
5. AgenticIf (LLM constrained enum + confidence; fallback if low confidence)
6. Loop (bounded; max iterations)
7. MemoryRead (Chroma retrieval)
8. MemoryWrite (propose patch only)
9. ValidateAndCommit (schema + sanity rules)
10. Notify (optional)

## Temporal mapping (planned)

- Temporal workflow = orchestration spine
- Activities execute node types
- Persist per-node traces and state snapshots for replay/debugging
