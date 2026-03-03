# Platformik overview

Platformik is an internal tool (showcase-quality, open-source) for building and running **AI agent
pipelines**:

- A workflow editor UI with blocks like IF/ELSE/LOOP and scheduled automations.
- “Agents” are configured workflow instances created from templates.
- Orchestration runs on **Temporal.io**.
- Users can plug in multiple LLM providers (OpenAI, Anthropic, etc.), choose models per flow, and
  optimize token usage.
- A practical memory system with strict invariants: canonical structured state + retrieval memory.

## Key design direction

Avoid dynamically generating huge workflow graphs per user/session. Instead:

- Use a small, stable skeleton workflow + templates/subflows.
- Put adaptation into canonical structured memory + a policy node selecting next activity.
- Use vector DB (Chroma) for retrieval memory only; it is not the source of truth.
- LLMs never directly mutate canonical memory; they output `proposed_memory_patch` which is
  validated before commit.
