# AUReviews

An Auburn undergraduate course-review site for CSSE-department (`COMP`-prefix) courses. This glossary is the ubiquitous language for the domain — the durable review data on one side, the imported-and-refreshed Auburn catalog data on the other.

## Language

**Course**:
The durable, permanent unit that reviews attach to, identified by an internal surrogate `Course.id` that we mint and own and that never changes. Auburn's `(subject, number, title)` — e.g. `COMP 2210 Data Structures` — is a set of *mutable attributes* on a Course, not its identity: when Auburn renumbers, renames, splits, or cross-lists, the durable `Course.id` is unaffected and its reviews follow it. The rated unit of the site — one page per Course. Splits, merges, and cross-lists are resolved by explicit admin decision, never inferred from an import.
_Avoid_: catalog entry, listing (those are the mutable Auburn-side attributes, not the durable thing)

**Current catalog attributes**:
The latest imported Auburn values carried on a Course — `subject`, `number`, `title`, `description`, `credit_hours`, prereqs. Last-import-wins; these are what the course page headline and body display. No per-catalog-year versioned snapshots are kept.

**Former identity**:
A prior `(subject, number, title)` a Course was known by, with the catalog-year range it was in effect. Kept as a lightweight list on the Course purely so an old review can be shown in the context it was written ("reviewed when this was COMP 2210"). Only numbering and title are historised — never the full former description, credit hours, or prereqs.

**Term**:
A semester + year, e.g. `Fall 2024`. The unit of the offering time axis.

**Offering**:
The concrete historical fact that a Course ran in a specific Term, at `(Course, Term)` grain, carrying the set of instructors-of-record who taught it that term. Sourced from Banner (back to Fall 2007). Banner's section-level rows are collapsed into this instructor set — Section is deliberately *not* a modeled entity (no CRNs, seat counts, or meeting times in v1). "Offered in Fall" is never a stored flag; it is a display-time rollup derived from the Terms in which Offerings exist.
_Avoid_: section, class, CRN

**Instructor**:
A first-class entity with a durable internal id, minted and owned by us — the person who teaches. Display name is a *mutable attribute*, so the identity survives a name change; the durable id, not the name, is what Offerings and Reviews reference. Populated from Banner instructor-of-record data, keyed on Banner's stable person id where one exists, else on a normalized name with admin de-duplication (adjuncts and name collisions are the residual hard cases). Same identity philosophy as Course. A Review's instructor reference is optional — the #6 *not-listed* / *don't-remember* escapes are sentinels, not a hard reference.
_Avoid_: professor, teacher, prof (as data terms); "instructor" is canonical

**Review**:
A user-authored, permanent, append-only record on the Review side. References the durable `Course.id`, an optional `Instructor.id`, and the `Term` it describes — all durable identities captured at write time, so no catalog refresh ever alters or moves a Review. Its captured contents are settled in #6. Reviews are never created, modified, or deleted by an import.

**Catalog side**:
The imported, refreshable, disposable half of the model — a Course's current catalog attributes, its `Offering`s, former-identities, and `status`. Re-derivable from Auburn at any time; safe to blow away and re-import.

**Review side**:
The user-authored, permanent, append-only half — `Review`s plus the durable `Course` / `Instructor` identities and the crosswalk that anchor them. The precious data; the reason durable ids exist.

**Verified Auburn student**:
Anyone who has proven control of an `@auburn.edu` mailbox via the sign-in code flow (only the canonical `@auburn.edu` form is accepted — `@tigermail.auburn.edu` is the same mailbox, so nobody is excluded, and one domain keeps the sign-in field a single fixed suffix; owner decision, PR #48) (an emailed single-use 6-digit code, typed back on the review form or the sign-in page) — the eligibility gate for authoring on the Review side. The site is built for current Auburn students choosing and sequencing courses, so user-facing copy calls verified users "Auburn students." One honest technical limit stands behind that copy: the gate proves mailbox control, not enrollment or that the reviewer took the course — a gap the anti-junk and legal posture (v1-spec §7/§10) account for, not one the copy claims away.
_Avoid_: affiliate (retired in favor of "student")

**Sign-in code**:
The emailed single-use 6-digit code a student types back to prove mailbox control — the verification token of the auth flow (#43). It can be entered on the review form (an Authentication section above Post; posting signs the author in as a side effect, with no mid-form navigation — #47) or on the standalone `/signin` page; both exchange it through the same server-only module (ADR 0003). One live code per address; expires in ~10 minutes; invalidated after 5 wrong guesses (wrong, expired, and exhausted are indistinguishable from outside). Stored only as a secret-hashed token against a peppered identifier hash, so neither the code nor the address is ever at rest. The email deliberately contains no URL: Auburn mail passes through Microsoft 365 Safe Links, which rewrites and pre-fetches links.
_Avoid_: magic link (retired in #43), OTP, verification link

**Identity hash**:
The durable, non-reversible author token for a verified student: `identity_hash = HMAC_SHA256(PEPPER, normalize(email))`, where the `PEPPER` lives outside the database. It is the only thing linking a person to their reviews, votes, and edits — the plaintext email is never at rest anywhere, even transiently (verification tokens store this same peppered hash as their identifier). A Review-side identity, minted at verification and stable across an author's actions, but **not a uniqueness key**: a person may hold more than one review per course (see #6/#8). Never sent to the client, and never exposed on any public or session surface.
_Avoid_: user id, email hash (the pepper, not a bare hash, is what makes it non-reversible)

**Import contract**:
The one-way rule at the seam between the two sides: an import is idempotent and may only create or update catalog-side attributes. It may never create, modify, or delete a `Review`, and never delete a durable `Course` or `Instructor`. A course dropped from the Auburn catalog is *retired* (status flip), not deleted — reversible if it reappears.

**Crosswalk**:
The single bridge mapping an incoming Auburn `(subject, number, catalog-year)` to either an existing durable `Course` (a renumber/rename) or a freshly minted one (genuinely new). Straightforward matches may be automatic; ambiguous ones — splits, merges, cross-lists — are **admin decisions**, never inferred, because only a human can assert "this new number *is* the old course."

**Status** (of a Course):
`active` when present in the latest Auburn catalog import; `retired` when it has dropped out. Retired courses keep their page and reviews, are de-emphasized in the browse index, and carry a "no longer in the active Auburn catalog" note. Retirement is reversible.
