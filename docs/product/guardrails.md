# Guardrails (non-negotiable invariants)

## Small graphs, stable skeleton

- Prefer templates/subflows over synthesizing large graphs.
- Adaptive behavior lives in structured state + policy selection, not massive graph generation.

## Schema-bound control and memory

- Any LLM output that affects control-flow or memory must be strict schema-bound JSON.
- `AgenticIf` is constrained to a small enum + confidence; low confidence falls back to safe static branch.

## Canonical memory safety

- Canonical memory is the source of truth.
- LLMs never mutate canonical memory directly.
- LLM outputs `proposed_memory_patch` only.
- `ValidateAndCommit` validates schema + sanity rules before commit.

## Operational guardrails

- Bounded loops (max iteration caps).
- Per-run budgets (tokens/cost/time), accounted per node for observability.
