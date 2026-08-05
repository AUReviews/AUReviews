# Durable internal identities for Course and Instructor

Auburn provides no identifier that survives a course being renumbered, renamed, split, or cross-listed, yet reviews are permanent and must stay attached to the "same" course and professor across catalog years. We therefore mint our own opaque, never-changing internal ids for `Course` and `Instructor`, and demote Auburn's `(subject, number, title)` and instructor display names to *mutable attributes* on those entities. Reviews and offerings reference the durable id, never the Auburn string.

## Considered Options

- **Natural key `(subject, number)`** — simplest to import, but breaks the instant Auburn renumbers anything, orphaning the permanent review data. Rejected: it optimises the cheap, re-importable side (catalog rows) at the expense of the precious, irreplaceable side (reviews).
- **Durable surrogate id (chosen)** — a renumber/rename becomes an attribute update; the review thread never moves.

## Consequences

- A course's number/title history is kept as a lightweight `former_identities` list so old reviews can be shown in the context they were written; full per-catalog-year snapshots are deliberately not kept.
- Splits, merges, and cross-lists cannot be inferred from an import — they require an explicit admin crosswalk decision (see ADR 0002).
- Instructor identity leans on a stable Banner person id where one exists; names-only data falls back to admin de-duplication.
