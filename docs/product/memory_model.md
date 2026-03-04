# Memory model (product)

Platformik uses **two-layer memory**:

## 1) Canonical memory (source of truth)

Structured JSON state stored in Postgres (JSONB). Example (Language Tutor):

- `user_profile`: languages, goals, preferences
- `curriculum_state`: topics completed/current
- `skill_metrics`: mistake categories + counts, level estimate
- `srs_items`: spaced repetition items with scheduling fields
- `constraints`: style, exclusions, safety rules

## 2) Retrieval memory (helpful context)

Vector store (Chroma) contains documents for retrieval:

- lesson notes, dialogs, examples, explanations
- metadata: topic, difficulty, date, `source_run_id`, `doc_type`

## Invariants

- LLMs never mutate canonical memory directly.
- LLM outputs `proposed_memory_patch` only (strict schema-bound JSON).
- `ValidateAndCommit` validates schema + sanity rules before commit.
- RAG is context only; it never overrides canonical truth.
