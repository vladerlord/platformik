# Workflow engine (conceptual)

## Spec format
Declarative workflow spec (JSON/DSL):
- nodes + edges + node parameters
- templates/subflows for reuse

## MVP node types (planned)
1) Trigger (cron/manual)
2) LLM (schema-bound output; optional tool calls)
3) Tool (HTTP/custom function)
4) StaticIf (deterministic branching via expressions)
5) AgenticIf (LLM branching to constrained enum + confidence; fallback if low confidence)
6) Loop (bounded; max iterations guardrail)
7) MemoryRead (RAG retrieval)
8) MemoryWrite (propose patch only)
9) ValidateAndCommit (schema + sanity rules)
10) Notify (optional)

## Temporal
Temporal workflow is the orchestration spine:
- activities execute node types
- persist run logs/traces and state snapshots for debugging/replay

