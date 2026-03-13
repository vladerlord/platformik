# Coding Principles

## Structure

- Prefer fewer files. Split only when it materially improves readability.

## Naming

- Prefer business meaning over implementation detail.
- Use full words for identifiers.
- Do not use abbreviations unless they are industry-standard and unambiguous (`id`, `url`, `http`, `json`,
  `i`).

## Responsibilities

- Each function, class, and module should have one clear responsibility.
- A unit should have one reason to change.
- Separate orchestration from business logic.
