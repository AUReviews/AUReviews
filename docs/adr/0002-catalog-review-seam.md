# Catalog / review seam: one-way import contract, retire-don't-delete

The model has two ownership domains: a **catalog side** (Auburn-imported, refreshable, disposable — current attributes, offerings, status) and a **review side** (user-authored, permanent, append-only — reviews plus the durable Course/Instructor identities and crosswalk). The seam between them is a one-way import contract: an import is idempotent and may only create or update catalog-side attributes — it may **never** create, modify, or delete a `Review`, and never delete a durable `Course` or `Instructor`.

## Consequences

- A course dropped from the Auburn catalog is **retired** (a `status` flip), not deleted — its page and reviews persist, it is de-emphasized in the browse index, and retirement is reversible if the course reappears. There is no "delete when zero reviews" rule.
- Mapping an incoming Auburn `(subject, number, catalog-year)` to a durable `Course` goes through the **crosswalk**: unambiguous matches may be automatic; splits, merges, and cross-lists are admin decisions, never inferred.
- The import pipeline can be re-run at any time without risk to user data, which keeps refreshes safe and cheap.
