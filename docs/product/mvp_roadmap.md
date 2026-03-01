# MVP roadmap (planned)

Scaffolding phase does **not** implement these yet, but documents the intended build order:

1) Workflow spec format (JSON/DSL) + loader + validator
2) Node runtime interface: `execute(node, inputs, state) -> outputs + proposed_patch + logs`
3) Canonical memory JSON schema for `EnglishTutorState`
4) ValidateAndCommit rules (schema + sanity)
5) MemoryRead: Chroma integration (store docs + metadata; retrieve top-k)
6) Minimal UI:
   - Template gallery
   - Wizard
   - Workflow viewer/editor (advanced optional)
   - Preview next run (simulate policy node)
   - Memory diff viewer (before/after)
   - Run logs/trace view

