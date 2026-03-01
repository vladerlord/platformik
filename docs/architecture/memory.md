# Memory architecture

## Two-layer memory
1) Canonical memory (structured source of truth)
2) Retrieval memory (vector store context; not source of truth)

## Canonical memory (source of truth)
Example fields (Language Tutor):
- `user_profile`: native_language, target_language, goals, preferences
- `curriculum_state`: completed_topics, current_topic
- `skill_metrics`: mistake categories + counts, level_estimate
- `srs_items`: vocab/phrases with scheduling fields (due_date, interval, ease_factor, lapse_count)
- `constraints`: style, excluded topics, etc.

## Retrieval memory (Chroma)
Stores helpful context only:
- docs: lesson notes, example sentences, dialogs, explanations
- metadata: doc_type, topic, date, difficulty, source_run_id

## Invariants
- LLM outputs `proposed_memory_patch` (JSON) only.
- LLM never directly mutates canonical memory.
- `ValidateAndCommit` validates schema + sanity rules before commit.
- RAG retrieval cannot override canonical truth.

