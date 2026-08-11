# AUReviews — v1 Spec

Status: **buildable.** This is the destination artifact of [Map: AUReviews v1 spec](https://github.com/AUReviews/AUReviews/issues/1) — every decision below was made on that map, by the tickets linked inline. Where two decisions pointed different directions, this document states which one wins and why (search for **"Resolving a contradiction"** callouts). An implementing agent or a solo dev should be able to build v1 from this document alone, without making further product decisions.

The ubiquitous language (Course, Instructor, Offering, Review, catalog side / review side) is defined in [`CONTEXT.md`](../CONTEXT.md) and [`docs/adr/0001-durable-internal-identities.md`](adr/0001-durable-internal-identities.md) / [`docs/adr/0002-catalog-review-seam.md`](adr/0002-catalog-review-seam.md). This spec assumes that vocabulary and doesn't redefine it.

---

## 1. Scope and north star

AUReviews (**AUReviews.com**) is a course-review site for Auburn undergraduates. v1 covers **CSSE-department courses only — all under the `COMP` prefix** (Auburn has no `SWEN` course prefix; SWEN and CSCI are *major* codes, both built almost entirely from `COMP` courses — see [§9](#9-course-data-sourcing-and-refresh)). The data model carries no CS-specific assumptions, so expanding to MATH/PHYS/ENGR later is a data-entry job, not a rewrite.

**North star: honest workload numbers.** Every review reports hours/week and difficulty as structured, numeric data — the "plan a semester, see the total load" capability no other tool gives an Auburn student. v1 ships the per-course atoms of that (§4, §6); the semester-summing feature itself is out of v1 (§14).

**The rated unit is the course; instructor is a field on the review**, not a separate page. One page per course, aggregates filterable by instructor. This is a deliberate divergence from every reference implementation (§2), forced by the fact that Auburn undergrad courses vary meaningfully by instructor in a way OMSCS/UT-MSCS/UIUC-MCS courses don't.

**The site must be useful with zero reviews.** Full CSSE catalog, prereq chains, and term-offering data stand on their own before a single review exists.

**No production code ships from the wayfinder map itself** — this document is the handoff to building it.

---

## 2. What informed this spec

Three prior-art sites were read from source, not just observed live — findings in [`research/reference-sites.md`](../research/reference-sites.md):

| | omscentral | MSCSHub | uiucmcs |
|---|---|---|---|
| Stack | Next.js + Sanity CMS | Angular + Firebase | Angular + Firebase, GitHub Pages |
| Rating scale | 1–5 | 1–7 | 1–5 |
| Instructor modeled? | No | Only as a `professorQuality` number | No |
| Domain-email verify | `@gatech.edu` via OTP, no account | Any email accepted | `@illinois.edu` regex, closest analog |

The single biggest non-transferable lesson: **none of the three model instructor as an entity**, because their courses don't vary by instructor. AUReviews deliberately does. Everything else — three-metric numeric core, term-on-review, catalog-stands-alone, client-side sort/filter, crowdsourced catalog corrections — is adopted or adapted as noted throughout this spec.

---

## 3. Domain model (summary)

Full detail: [`CONTEXT.md`](../CONTEXT.md), [ADR 0001](adr/0001-durable-internal-identities.md), [ADR 0002](adr/0002-catalog-review-seam.md). Settled via [Domain model: courses that change across catalog years](https://github.com/AUReviews/AUReviews/issues/7).

- **Course** — durable, internally-minted `id`. Auburn's `(subject, number, title)` are *mutable current attributes*, last-import-wins, no per-year snapshots. A lightweight `former_identities` list (number/title + catalog-year range only) lets an old review render in the context it was written. `status` is `active` or `retired` (a catalog dropout is retired, never deleted — reversible).
- **Instructor** — durable internal `id`, same identity philosophy as Course. Display name is a mutable attribute. Keyed on a stable Banner person id where one exists, else normalized name + admin de-duplication (flagged for import-design: confirm whether Banner exposes a stable instructor id — not a spec blocker, an implementation-time check).
- **Offering** — the fact a Course ran in a `(Course, Term)` with an instructor-of-record set, sourced from Banner. **Section is not modeled** — no CRNs, seat counts, or meeting times in v1. "Offered in Fall" is never a stored flag; it's a display-time rollup over Offerings (§6).
- **Catalog side vs. review side.** Catalog side (current attributes, Offerings, `former_identities`, `status`) is imported, refreshable, disposable. Review side (Reviews, plus the durable Course/Instructor identities and the crosswalk) is user-authored and permanent. The seam is a one-way **import contract**: an import is idempotent and may only create/update catalog-side attributes; it may **never** create, modify, or delete a Review, and never delete a durable Course or Instructor.
- **Crosswalk.** Maps an incoming Auburn `(subject, number, catalog-year)` to a durable Course. Unambiguous matches may be automatic. **Splits, merges, and cross-lists are admin decisions, never inferred** — see §12 for how that decision gets made without an admin UI in v1.

---

## 4. Review schema

Settled in [What a single review captures](https://github.com/AUReviews/AUReviews/issues/6). A short **required core**, always visible, plus an all-optional **"Course details"** zone — so a useful review is fast to finish, and nothing in the optional zone can block submission.

### Required core

| Field | Type                                 | Rule |
|---|--------------------------------------|---|
| `overall` | integer 1–5                          | Required. "How good was this course overall?" Headline number, default sort key. Folds in "would recommend" (dropped as redundant). |
| `difficulty` | integer 1–5                          | Required. Anchored labels (1 = very easy … 5 = very hard) so 3 means the same to everyone. Genuinely separate signal from `overall`. |
| `workload_hours` | integer 1–40                         | Required. "Typical hours per week **outside of lecture**." Free-entry number field, not a slider (sliders bias to round midpoints). The north-star metric. |
| `term` | semester (Fall/Spring/Summer) + year | Required. Selectable range is a **rolling window** — see below — but the actual term is always stored. |
| `instructor` | dropdown, scoped to the course       | Required. Populated from Banner instructor-of-record data (§9). Escape hatches: **"Instructor not listed"** and **"Don't remember"** — an explicit unknown beats a null, and a curated dropdown is what makes the by-instructor breakdown (§7) actually work. |
| `body` | free text                            | Required, **100-character minimum**, no maximum, one hint-guided box (placeholder: *"What surprised you? How would you prepare? What was the workload actually like week to week?"*). This is the only place person-specific claims may appear (§10). |

### "Course details" — all optional

| Field | Type | Options |
|---|---|---|
| `workload_shape` | multi-select (0+) | Steady grind · Project spikes · Front-loaded · Back-loaded · Heavy reading · Exam-crammable |
| `grade` | single-select | A · B · C · D · F · Pass · Fail · Withdrew |
| `languages` | multi-select + free-text Other | Java · C · C++ · Python · C# · JS/TS · SQL · Assembly · Other · **No programming** |
| `curved` | single-select | Curved up · Not curved |
| `attendance` | single-select | Mandatory · Recommended · Not needed |
| `prep` | single-select | Well prepared · Somewhat · Underprepared |

Grade-composition (% projects vs. exams) was considered and **cut** — low-signal for most `COMP` courses, and the highest-friction candidate.

### System fields (not user-entered)

| Field | Purpose |
|---|---|
| `course` | Reference — the rated unit. |
| `identity_hash` | HMAC-peppered author token (§7). Lets an operator correlate one person's reviews. **Not a uniqueness key** — see the contradiction callout below. |
| `status` | Enum, default `published`. Also `pending` (panic-switch mode), `removed` (admin takedown), `deleted` (self-delete). Supports post-publish takedown *and* a pre-publish gate without a schema change. |
| `edited` | Boolean flag, set when the author edits after initial publish. |
| `contested` | Boolean flag, set by the author from "My reviews" (§13) after a takedown, to request re-review (§10). |
| `helpful_up` / `helpful_down` | Per-voter tracked (not just aggregate counters) — votes are retractable/flippable (§10, §5), so a `review_votes(review_id, identity_hash, direction)` table backs these, not two bare integers. |
| `created_at` | Timestamp. |

### Recency: a rolling, configurable term window

The `term` dropdown offers only a bounded recent window, held as an **application config value** (an env var or a single-row settings table — not hardcoded):

- **Launch setting:** any semester/year within the **past 4 years** (~12 terms) — pulls in current students *and* recent alumni for the initial review pool.
- **Steady-state setting:** rolls down to the **last 3 semesters** once the seed wave has passed.

v1 ships with the window defaulting to the launch (4-year) setting. Existing reviews persist and display regardless of the window; the window only governs what term can be *selected when submitting*.

### Duplicate handling — allowed, correlated, not blocked

A person **may** post more than one review for a course (retook it, reviewing a later term). The shared `identity_hash` lets an operator spot brigading; helpful-voting and Wilson-ranking (§5) sink low-quality duplicates rather than blocking them. **There is no `(identity_hash, course_id)` uniqueness constraint.**

> **Resolving a contradiction.** The auth research ([`research/edu-verification-auth.md`](../research/edu-verification-auth.md)) proposed a unique index on `(identity_hash, course_id)` as part of the anonymity architecture, written before the review-schema and moderation decisions were made. Those later, more specific decisions ([#6](https://github.com/AUReviews/AUReviews/issues/6), [#8](https://github.com/AUReviews/AUReviews/issues/8)) explicitly settled on **multiple correlated reviews per person per course, not a hard block**. This spec follows the later decision: build no uniqueness constraint on `(identity_hash, course_id)`. Every other part of the auth research's anonymity architecture (HMAC pepper, no stored plaintext email, `identity_hash` never sent to the client) stands unchanged — see §7.

### Anti-junk model (no extra required fields)

1. `@auburn.edu` verification to submit (§7).
2. Email-OTP rate limiting (§7).
3. Stored `identity_hash` for operator correlation.
4. Helpful-voting + Wilson-score ranking that sinks low-quality reviews rather than blocking them (§5).
5. The required core itself — three numbers + term + instructor + 100-char body — is a substantive floor.

---

## 5. Aggregate and ranking semantics

Settled in [Aggregate and ranking semantics](https://github.com/AUReviews/AUReviews/issues/11).

**Three separate metrics, no composite.** A course reports `overall` /5, `difficulty` /5, and `workload` hrs/week **side by side**. No blended star score — a composite would bury the workload signal and manufacture a rankable number the moderation/legal decisions (§10) warn against.

**Computation: plain arithmetic mean** for all three (`mean = sum / count`), matching all three reference sites. Median/trimmed-mean for the fat-tailed workload field was considered and deferred as a swappable implementation detail, negligible at launch N. Display precision: two decimals (e.g. `3.12`).

**Low-data rule — a computed average requires N ≥ 2, applied everywhere an average appears** (course headline, index row, each by-instructor row):

- **N = 0** — no average; the catalog page still stands alone with a **"No reviews — write one"** CTA linking straight into the review form.
- **N = 1** — the single review displays in full with its own pills and date, but **no headline average**; index/by-instructor rows show **"—"** with the real count (`1`) still visible.
- **N ≥ 2** — averages shown.

Data is never hidden; only the *computed average* waits for N ≥ 2.

**Recency: no decay.** §4's rolling term window already handles staleness at the submission gate; every in-window review weighs equally once it exists. Each review's term is shown and is a sort option.

**Instructor.** The course-page headline is fixed course-wide and **never mutates** on filter. A **"By instructor" breakdown** section carries one row per instructor who taught the course — `overall`/`difficulty`/`workload`/`N`, same N ≥ 2 rule — in **neutral default order** (most-recently-taught or alphabetical, not ranked), user-sortable by any rating. A RateMyProfessors convenience link is deliberately deferred (routes traffic to the exact professor-ranking framing §10 avoids).

**Index/browse page — click-to-sort table, never a leaderboard**, modeled on omscentral's home page:

| Course | Code | Overall | Difficulty | Workload | Reviews (N) |
|---|---|---|---|---|---|

Default sort = **catalog order (COMP number ascending)** — stable, reads identically empty or full, avoids a soft popularity ranking. Every column is click-to-sort, but there is **no default leaderboard and no "worst/hardest courses" framing anywhere.** Sub-threshold (N=1) courses show "—" in the rating columns with their real N.

**Vote mutability.** Helpful votes are retractable/flippable per voter (§4's `review_votes` table), which is what the "reviews you've voted on" list on the My Activity page (§13) is built from.

**Left as fog, not v1's job:** instructor-primary pages (a cross-course instructor page) and fuzzy/full-text search beyond browse+sort. **v1's discovery surface is the click-to-sort table only** — no search box is built for v1.

---

## 6. Catalog features (how deep "useful while empty" goes)

Settled in [How deep the catalog-as-value features go in v1](https://github.com/AUReviews/AUReviews/issues/10), **amended by** [Does v1 ship the semester load planner?](https://github.com/AUReviews/AUReviews/issues/12).

**In v1:**

1. **Course detail — full.** Title, `COMP` code, credit hours, description, prerequisite text, and a **catalog-year stamp** so a reader knows how current the page is.
2. **Prereq chains — a parsed list, both directions, not a graph.** A custom parser over the bulletin's `Pr.` prose grammar (§9) produces structured edges, rendered as **"Prerequisites: …"** and the inverse **"Unlocks: …"** as clickable course links. The parser is the accepted cost; verbatim prose text is the fallback if it proves too heavy. A visual interactive prereq graph is explicitly **not** built in v1 (§14).
3. **Term offerings — a Banner-derived rollup badge.** *"Typically offered: Fall, Spring"*, computed from the Offering history (§3) that the review instructor dropdown already requires storing. Bulletin term *claims* are rejected as strictly worse data.

> **Resolving a contradiction.** The original resolution on [#10](https://github.com/AUReviews/AUReviews/issues/10) put a **static, per-catalog-year curriculum flowchart** in v1 (the CS/SWE semester-by-semester degree plan, parsed from bulletin tables). [#12](https://github.com/AUReviews/AUReviews/issues/12) **reopened and cut it**: it's the most planner-adjacent, least review-adjacent catalog feature; its recommended-sequence grid is exactly what the deferred interactive planner re-renders three months later (throwaway UI); and it required a **second bulletin parser** (degree-plan tables) that only the planner truly needs. **The static curriculum flowchart is not built in v1.** Its grid folds into the deferred interactive planner (§14). Accepted consequence: **v1 ships no degree-sequence guidance** — the Prerequisites/Unlocks lists and term-offered badge carry the structural catalog value, but nothing says "what order to take these" until the planner lands post-v1.

---

## 7. Auth, identity, and anonymity

Settled in [Verifying @auburn.edu addresses](https://github.com/AUReviews/AUReviews/issues/5) and [Database, hosting, and auth provider](https://github.com/AUReviews/AUReviews/issues/9). Full architecture: [`research/edu-verification-auth.md`](../research/edu-verification-auth.md).

**Provider: Auth.js (NextAuth), self-hosted**, email/magic-link flow. Restricted to Auburn addresses in a one-line `signIn` callback:

```ts
callbacks: { signIn({ profile }) { return profile.email.endsWith("@auburn.edu") || profile.email.endsWith("@tigermail.auburn.edu") } }
```

Free forever, full schema control, lowest lock-in. Clerk was rejected (domain allowlist is paid-in-production); Supabase Auth was runner-up but its free tier fully pauses after 7 days idle — real outage risk for a site with sporadic between-registration-week traffic.

**Delivery: Resend**, 3,000 emails/mo free (covers verification volume). Sent from a **dedicated subdomain** (e.g. `mail.aureviews.com`) with **SPF + DKIM + DMARC published** — mandatory to avoid Microsoft 365's junk filters (Auburn is on M365), not optional hardening.

**Anonymity architecture — HMAC-peppered identity hash:**

1. User submits address; server rejects anything not ending `@auburn.edu` / `@tigermail.auburn.edu` before doing anything else.
2. A single-use, expiring magic-link token is issued and emailed (Auth.js handles token storage).
3. On click, compute `identity_hash = HMAC_SHA256(PEPPER, normalize(email))`. **`PEPPER` lives in a secret manager / environment variable, never in the database.** The plaintext email is **not persisted** past this step.
4. `identities(identity_hash, verified_at)` is upserted. Session cookie carries an opaque session id mapped server-side to `identity_hash` — never the address, never the raw hash, to the client.
5. Reviews key to `identity_hash` (§4) — with **no uniqueness constraint** on `(identity_hash, course_id)` (see the callout in §4).
6. Public API payloads **omit `identity_hash` entirely.**
7. Edit/delete: the logged-in user's session resolves to `identity_hash`, which finds their rows — no email round-trip needed.

**What this buys, stated honestly:** a database breach or a "produce the database" subpoena yields only non-reversible hashes. A **targeted** court order compelling the pepper *and* a suspected address can still confirm authorship of one specific review — a deliberate, documented residual, not a gap (§10).

**Audience.** The site is built for current Auburn students planning their courses, and user-facing copy calls verified users **"Auburn students."** Eligibility is email-based, so it is technically broader than current enrollment — Auburn retains alumni/retiree email, and email verification proves mailbox control, never enrollment or that the reviewer took the specific course. That is an accepted, documented limit (see "Known, accepted abuse ceiling" below and §10), not something the copy claims away.

**Rate limits:**
- Email-send throttle: ≤3 sends/address/hour, ≤10 sends/IP/hour, global ceiling well under Resend's 100/day.
- One live verification token per address, single-use, 15–60 min expiry.
- A post-verification posting cap (e.g. N reviews per identity in its first hour/day) to blunt a freshly-farmed alias.
- CAPTCHA/proof-of-work on the request-email endpoint if automated enumeration is observed.

**Known, accepted abuse ceiling:** email aliasing lets one real student hold a handful of distinct `identity_hash` values (bounded — Auburn alias requests carry friction). Email-only verification proves "controls an Auburn mailbox," not "took this course" or "is still enrolled." This is inherent to the design, not a bug to fix in v1.

---

## 8. Stack, hosting, and rendering

Settled in [Database, hosting, and auth provider](https://github.com/AUReviews/AUReviews/issues/9). Optimized throughout for a **solo, no-budget maintainer who may not touch the code for a month.**

| Layer | Choice | Why |
|---|---|---|
| **Data layer** | Relational **Postgres on Neon**, provisioned via the Vercel–Neon integration | Domain model (§3) is inherently relational; the north-star value is numeric aggregate/filter queries. Sanity (omscentral's choice) caps at 10k documents and is weak at aggregates. Neon **autosuspends to zero when idle** — no idle bill, no pause-outage (unlike Supabase's 7-day full pause). App + Auth.js use the **pooled** endpoint; migrations use the **direct** endpoint. |
| **Hosting** | **Vercel Hobby** (free) | No idle-pause, best Next.js DX. Cost stays flat under a registration-week spike because reads are CDN-served static (below). AWS was weighed and rejected: ~$15–45/mo steady-state after its 12-month free tier, plus VPC/IAM/RDS ops — the opposite of hands-off. |
| **Auth** | Auth.js self-hosted + Resend (§7) | Owns its tables in the same Neon Postgres; no per-MAU cost. |
| **Rendering** | **ISR + on-demand revalidation** | Course, browse-index, and catalog pages are CDN-static; any write (review submit/edit/delete/takedown, or a catalog import) calls `revalidateTag`/`revalidatePath` for the affected course, so aggregates refresh within seconds while reads stay cache-served. This is what lets the free tier survive a registration-week traffic spike. Genuinely per-user surfaces (review form, My Activity) stay dynamic — low traffic, no spike exposure. Aggregates are a SQL query computed at revalidation time over §4's rolling window — no materialized views needed at v1 volume. |
| **Repo shape** | **Single Next.js app**, with an `ingest/` module seam | The ingest module imports the domain layer, **never the reverse** — mirrors the catalog/review seam (§3). A separate scraper service was rejected as pure overhead for a solo dev with no near-term pressure toward a split (catalog expansion is more inputs through the same parser, not a new service). |
| **Catalog refresh** | **GitHub Actions**, weekly + manual `workflow_dispatch` run-now | The scrape (bulletin + Banner 8, §9) can run for minutes, exceeding Vercel Hobby's ~60s function / ~once-daily cron ceiling. The Action runs the same in-repo `ingest/` module as a Node script, writes to Neon over the pooled connection, then pings the revalidation endpoint. Idempotent (ADR 0002); ambiguous crosswalk matches surface as **pending rows**, never auto-applied — resolution mechanics in §12. |

---

## 9. Course-data sourcing and refresh

Settled in [Where Auburn CSSE course data comes from](https://github.com/AUReviews/AUReviews/issues/3). Full detail, including sample records and exact endpoints: [`research/auburn-course-data.md`](../research/auburn-course-data.md).

| Data | Source | Access | Refresh |
|---|---|---|---|
| Catalog (code, title, credit hours, description, prereq text) | Bulletin CourseLeaf, `bulletin.auburn.edu/coursesofinstruction/comp/` | Public HTML, crawl-permitted (`robots.txt` does not disallow `/coursesofinstruction/`) | Annual (catalog-year change) + a lightweight monthly diff |
| Prerequisites | Same bulletin pages | Public, **semi-structured prose** following a regular `Pr.` grammar (course tokens, `and`/`or`, parenthetical grouping, grade thresholds, cross-department tokens) — not machine-structured fields; a custom parser is required and is the accepted cost (§6) | Same as catalog |
| Term offerings + per-section instructor-of-record | Legacy **Banner 8**, `ssbprod.auburn.edu/pls/PROD/…` (`bwckschd`/`bwckctlg`) | **Public, no login**, every term back to **Fall 2007**; no JSON API, HTML scrape only; term-code scheme `YYYYT0` (10=Fall, 20=Spring, 30=Summer), derived — validate against the live dropdown before hardcoding | Per term; weekly during the build/registration window catches instructor/section changes |

**Scope correction carried into this spec:** there is **no `SWEN` course prefix** — all CSSE undergraduate courses are `COMP`. A separate **`CPSC`** prefix exists in the bulletin index; its status (legacy vs. active vs. distance-track) was **not resolved** by the research. Per the map's settled premise (§1, v1 catalog = `COMP`-prefix only), **CPSC is out of v1 scope regardless of its status** — confirming its exact nature is deferred to whenever post-v1 catalog expansion is considered (§15), not a v1 blocker.

**No durable cross-catalog-year key exists** on the Auburn side — no visible permanent course id in the public HTML. This is exactly why the domain model (§3) mints its own durable `Course.id` rather than trusting `(subject, number)` as identity (ADR 0001); treat a detected renumber as a crosswalk decision, never an inferred alias.

**Degree-plan/flowchart tables** are technically parseable per-catalog-year bulletin HTML, but **this parser is not built in v1** — the static curriculum flowchart that would have used it was cut (§6). Don't build it; it's a post-v1 concern tied to the deferred interactive planner.

**Permission posture:** bulletin `/coursesofinstruction/` and `/undergraduate/` paths are crawl-permitted; `/archivedbulletins/` and `/pdf/` are disallowed (use live year-scoped HTML, not PDFs or archives). The Banner 8 host has no `robots.txt` at all. Scrape at a polite rate; §10's attorney consult should confirm sourcing terms before public launch.

---

## 10. Legal posture and branding

Full detail: [`research/legal-posture.md`](../research/legal-posture.md), settled in [Legal posture for hosting student reviews that name professors](https://github.com/AUReviews/AUReviews/issues/4), [Moderation and abuse policy](https://github.com/AUReviews/AUReviews/issues/8), [Name and domain: AUReviews / AUReviews.com](https://github.com/AUReviews/AUReviews/issues/16). **Nothing here is legal advice** — the attorney checklist at the end of this section is load-bearing, not decorative.

**Section 230 is the backbone.** As a host of user-submitted reviews, moderating/curating/removing content does not forfeit § 230 immunity — the statute is designed to protect exactly that (*Zeran v. AOL*). The one real limit is the *Roommates.com* "material contribution" line: **every site-supplied prompt or dropdown option must be neutral and non-accusatory; every substantive claim about a person must originate entirely in the user's free text.** This is why §4's structured fields are all descriptive (hours, difficulty, grade, instructor picker) and never accusatory, and why aggregating user-submitted numbers into an average is a "neutral tool," not site-authored content.

**Defamation risk runs primarily against the student author, not the site.** Alabama has **no anti-SLAPP statute** — even a losing suit must be fought on the merits with no fast off-ramp — so a rigorous, opinion-framed review-guidelines posture (§10 below) and a prompt documented takedown process both matter beyond their moderation value: Alabama's libel retraction statute (Ala. Code § 6-5-186) caps punitive damages when a documented retraction demand is honored.

**Anonymity is protected but not absolute.** A professor could pursue a John Doe suit to unmask a reviewer; what the site can be compelled to hand over is limited to what it **retains** — which is why §7's data-minimization architecture (no stored plaintext email, HMAC pepper outside the DB, short-lived IP/request logs) *is* the anonymity policy, not a separate control.

**No hosting of copyrightable course materials** (exams, slides, PDFs) — reviews only. This avoids the DMCA § 512(h) subpoena route, which lets a copyright holder unmask a poster with no lawsuit at all (as happened to Course Hero via a professor at Chapman University).

**Branding.** **Name = AUReviews, domain = AUReviews.com, org/repo = `AUReviews/AUReviews`.**

> **Resolving a contradiction.** The legal-posture research explicitly recommended a **non-Auburn name** (`plainscourses.com`) specifically to hold trademark/affiliation risk near zero. [#16](https://github.com/AUReviews/AUReviews/issues/16) **overrides that recommendation by maintainer decision** — "AU" and "Auburn" are the university's registered marks, and naming the site with them reintroduces exactly the exposure the original research engineered away. **The maintainer has weighed and accepted that higher exposure.** Every other #4 mitigation stands unchanged: **plain wordmark only** (never Auburn's interlocking-AU logo, colors, eagle, or "War Eagle" marks), a prominent **"Not affiliated with Auburn University"** disclaimer site-wide, and name clearance for "AUReviews" specifically is now **explicitly in scope** for the pre-launch attorney consult below.

**Required legal pages/content for launch:**
- **Terms of Service** — eligibility (`@auburn.edu`-verified), a narrow content license (not RMP's broad "throughout the universe" grant), user warranties (first-hand, not knowingly false), prohibited content, indemnification, AS-IS/limitation of liability, non-endorsement statement, the Auburn non-affiliation disclaimer, discretionary-removal rights, 18+ requirement, governing law (🔴 attorney to finalize).
- **Privacy Policy** — what's collected, the retention/deletion schedule (§11), the subpoena-notification practice.
- **Review Guidelines**, shown *inline in the review form at the moment of authoring* (§13), not just buried in the ToS — content specified in §11.
- **Footer disclaimer** (every page) using the language: *"AUReviews is an independent, student-run website. It is not affiliated with, endorsed by, sponsored by, or connected to Auburn University... 'Auburn University,' 'Auburn,' 'War Eagle,' and related marks are trademarks of Auburn University, used here only to identify the institution whose courses are reviewed."*
- **DMCA agent registered** with the U.S. Copyright Office (renew every 3 years), published on-site.
- **`legal@aureviews.com`** forwarding alias (e.g. Cloudflare Email Routing, ~10 min setup) delivering to the operator's personal inbox as a phone notification — the one always-on obligation (§12).

**🔴 Attorney checklist — bounded, one-time consult, before public launch:**
- Clear the final name **"AUReviews"** (and domain) against Auburn's marks, including nickname marks.
- Review ToS, Privacy Policy, and Review Guidelines; finalize governing law and any arbitration clause.
- Advise on Alabama's unmasking standard for anonymous posters (no clear appellate precedent exists) and the subpoena-response protocol.
- Confirm the §11 retention durations (30/90-day defaults) don't conflict with litigation-hold/spoliation duties.
- Read and confirm Auburn's current Appropriate Use Policy and Code of Student Conduct sections don't reach an off-infrastructure independent site; confirm acceptable course-data sourcing.
- Advise on media/cyber-liability insurance and whether to operate through an LLC.

---

## 11. Moderation and abuse policy

Settled in [Moderation and abuse policy](https://github.com/AUReviews/AUReviews/issues/8). The tie-break between [#6](https://github.com/AUReviews/AUReviews/issues/6)'s publish-on-submit lean and [#4](https://github.com/AUReviews/AUReviews/issues/4)'s pre-publish-queue lean is **sustainability**: this runs on one student who disappears for exam week. § 230 makes moderation safe either way; nothing legal *forces* a queue.

**Model: publish-on-submit, no pre-publish queue by default.** Two enforcement surfaces, neither a proactive operator queue:

**A. The door (automated, synchronous, zero operator).** Submit-time hard-blocks bounce a submission back **inline, live, before Submit is clickable** — never after. Blocks: URLs/links, contact/doxxing patterns, a slur/protected-characteristic blocklist, the 100-char minimum (§4).

**B. Report → admin takedown (post-publish, pull-based, no SLA except legal).** Everything the door can't reliably catch — named misconduct accusations, targeted abuse, off-topic content, subtle protected-characteristic remarks — publishes live and is surfaced only when a reader reports it. **The operator never proactively scans.**

**Review Guidelines** (shown inline in the review form at authoring time), modeled on RateMyProfessors' published list, with deliberate divergences forced by other settled decisions:

*Prohibited (takedown-eligible):* named accusations of misconduct/illegal activity; protected-characteristic or appearance remarks; identifying/contact info; content about TAs or other students (reviews cover only the course and its instructor-of-record); profanity (bright-line prohibited, enforced reactively — not door-blocked, to avoid false positives); wrong-course/off-topic; spam/impersonation/self-review.

*Diverges from RMP because:* **not** one-review-per-course (§4 allows multiple, correlated); **no** "we read every review" claim (publish-on-submit); **no** claim that profiles are user-submitted (they're imported from Banner, §9); **no** anti-SLAPP fee-shifting threat (Alabama has none, §10); **no** promise to hand IPs to authorities (IPs are purged, §10); **no** "your data becomes our property" clause (§10's content license is narrow, not an assignment).

**Enforcement mechanics:**
- Rate limits: from §7's auth layer (email-send throttle, OTP limits).
- Duplicates: allowed and correlated (§4), not blocked.
- **Author edit + delete, both allowed.** The user's session resolves to `identity_hash` (§7), which finds their rows without any email round-trip. **Editing re-runs the full submit pipeline** (all door-blocks) so a bait-and-switch edit can't ride earned trust past the filters. Helpful votes are **kept** across an edit; the review is stamped `edited`.
- **Reviews persist indefinitely.** §4's rolling term window governs only what can be *submitted*, never display or lifespan. A review is removed only by self-delete, admin takedown, or legal demand.

**Takedown criteria — no special deference.** A professor's or department's removal request is judged against the **same published guidelines** as any reader report. "Remove this compliant negative review" is declined. A request identifying a genuine violation is honored. **Legal demands** (attorney letters, court orders, DMCA, Alabama retraction demands) leave the moderation track entirely and route to the 🔴 attorney process (§10).

**Silent-or-not: author-notified, publicly silent.** The removed review's author always sees the removal and why, via the pull-only **My Activity** page (§13) — there's no stored email→review link to push a notification to (§7's minimization). A **"Contest this removal"** action sets `contested=true` (§4), which the operator resolves manually (§12). The public sees nothing beyond the review disappearing; it **drops from all aggregates immediately.**

**Retention (reconciling fraud-forensics against §10's minimization defense):**
- **Soft-delete** keeps the full removed content for a bounded window — **~30 days for self-deletes, ~90 days for admin takedowns** — during which forensics and appeals work.
- After the window, content **purges to a minimal tombstone**: `id`, `course`, `identity_hash`, `created_at`, `deleted_at`, `status=deleted`. The `identity_hash` trail survives (detects delete-repost brigading); the content — the only part with defamation/identifying value — is gone.
- **These durations are 🔴 attorney-confirm** (§10) before they're treated as final.

**"Report a concern" — a separate, ungated form** (no `@auburn.edu` gate — a visitor spotting a bug shouldn't have to prove enrollment), for informal removal requests, bug reports, and anything not tied to a specific review. Distinct from the per-review **"Report this review"** action.

---

## 12. Operations without a console (v1)

The admin/operator console was prototyped in full ([Prototype: admin dashboard](https://github.com/AUReviews/AUReviews/issues/15) — break-glass toggles, a reported-reviews queue, a pending-crosswalk queue, catalog-import status, a legal log) and then **pulled from v1 scope by maintainer decision**, to be built later alongside the interactive-planner/semester-load-view effort. Its design is preserved for that effort. **But §7's moderation model and §8's stack both assume an operator can act at launch** — takedowns, the panic switch, read-only mode, and human crosswalk/instructor-dedup calls. This section is that explicit reconciliation: **how the solo operator performs each of those duties in v1, with no console UI.**

The substitute is three mechanisms, all already present in the stack (§8):

1. **Two Vercel Edge Config flags**, read by the app on every relevant request, toggled from the Vercel dashboard (works from a phone, no redeploy, propagates in seconds):
   - `moderationMode: "open" | "queue"` — the **panic switch**. `"queue"` flips new submissions' default `status` to `pending`, i.e. a full pre-publish gate, for a coordinated-abuse crisis.
   - `readOnly: boolean` — **read-only mode**. Pauses new submissions while the catalog and all existing reviews stay live — the graceful-abandonment valve if the operator steps away permanently.
2. **A `runbook/` folder of parameterized, versioned SQL scripts**, run against Neon via its web SQL console or `psql`, for every action that would otherwise be an admin-UI button:
   - `runbook/takedown.sql` — sets a review's `status='removed'` with a reason and timestamp.
   - `runbook/contest-resolve.sql` — resolves a `contested=true` review (uphold or reinstate).
   - `runbook/crosswalk-accept.sql` / `crosswalk-reject.sql` — applies or discards a pending renumber/merge/split match written by the ingest job (ADR 0002).
   - `runbook/instructor-merge.sql` — merges two Instructor rows flagged as the same person (e.g. `"W. H. Heaton"` vs. `"William Haynes Heaton"`), repointing their Offerings/Reviews.
3. **Email-routed inboxes, not a dashboard to poll** — reusing the Resend integration already in the stack (§7/§8):
   - Each "Report this review" submission writes a row **and** emails the operator (via Resend) with the review's id/link.
   - Each "Report a concern" submission (§11) does the same into a `concerns` table.
   - `legal@aureviews.com` (§10) forwards to the operator's personal inbox as a phone notification — the one duty that's always-on.
   - The weekly catalog-import GitHub Action (§8) extends its existing run summary to flag when it wrote pending crosswalk/instructor-merge rows (a `::warning::` step annotation is sufficient; an email is optional).
   - **Auto-flagged content** (the door's soft-flag pass that publishes anyway) gets **no email push** — deliberately, so it can be ignored entirely during exam week. It's browsable via a saved runbook query when time permits.

This reproduces every duty the #15 prototype's admin console would have handled, at the cost of the operator running a SQL script instead of clicking a button — a deliberate trade that keeps v1 to a single Next.js app with no second surface to build, test, or secure. It satisfies §11's "safe to leave unattended" requirement exactly as designed: nothing here requires polling, reports/concerns/legal all push to the operator, and both break-glass flags flip from a phone with no deploy.

When the interactive-planner/semester-load-view effort (§14) eventually builds the real admin console, the #15 prototype is its design-of-record — this section is superseded by that console, not by a new decision.

---

## 13. Page inventory and behaviors

Design source: **`prototype/index.html`** (see [`prototype/SOURCE.md`](../prototype/SOURCE.md)) — a single self-contained, full light/dark/system-themed file, imported from the Claude Design project that is the canonical design source. Settled in [Prototype: course page, index, and review form](https://github.com/AUReviews/AUReviews/issues/13), with additions from [#8](https://github.com/AUReviews/AUReviews/issues/8). Build from `prototype/index.html`, not any earlier throwaway artifact or branch (both retired).

**Covered by the current prototype:**

- **Landing page** — marketing + search entry point. Added when the prototype moved in-repo; no ticket owned it individually (low-decision surface), folded into this page inventory directly.
- **Browse/index page** — the click-to-sort catalog table (§5): Course · Code · Overall · Difficulty · Workload · Reviews(N), default catalog order, no leaderboard framing.
- **Course page** — Overview/Reviews tabs; three separate metric tiles with **workload as the hero tile** (§5); prereq + "Unlocks" chips and the "Typically offered" rollup badge (§6); a by-instructor breakdown table and instructor filter tabs (§5); the review list with helpful up/down voting.
- **Review submission ("Add") form** — the full §4 schema: required core, then the optional "Course details" zone. Door-blocks are live/inline (§11). Includes the theme toggle (light/dark/system, persisted to `localStorage`, `system` follows `prefers-color-scheme`) and the sign-in/verification entry point.

**Not yet covered by any prototype — build fresh, matching the existing visual system, before v1 ships:**

- **My reviews / My Activity page** (introduced by [#8](https://github.com/AUReviews/AUReviews/issues/8)) — lists the signed-in user's own reviews with their helpful scores and edit/delete actions; shows any removed review with its reason and a **"Contest this removal"** action; lists reviews the user has voted on. This is the *only* place an author learns of a takedown (§11) — it must exist for the moderation model to function, not just as polish.
- **Report a concern** form ([#8](https://github.com/AUReviews/AUReviews/issues/8)) — ungated, site-wide, routes to the concerns inbox (§12).
- **Legal pages** — Terms of Service, Privacy Policy, full Review Guidelines, footer disclaimer (content specified in §10/§11).
- **Review-form additions specified but not yet rendered in the prototype:** the inline collapsible Review Guidelines panel inside the form, the live character counter gating Submit at 100 chars, and the ToS/Privacy/18+ assent line at the Submit button.

**Explicitly not a v1 page:** the admin/operator console. See §12 for how those duties are handled instead.

**Data note carried from the prototype:** catalog data (course numbers, titles, prereqs) is real; any review text and instructor names shown in the prototype are synthetic placeholders, called out on-page — do not treat prototype review content as real data or copy it into a seed script.

---

## 14. Out of scope for v1

Recorded on the map; restated here for completeness so a builder never has to cross-reference to know what's excluded.

- **The full Auburn course catalog** beyond CSSE/`COMP`. Competing with RateMyProfessors university-wide would put review density near zero everywhere.
- **Graduate courses and programs.** This is explicitly the undergrad site.
- **Native mobile apps.** Responsive web only.
- **Importing third-party review corpora** (RMP scrapes, old Reddit threads) to fake density. Ruled out in favor of a catalog useful while empty (§6) plus a genuine seed drive (§15).
- **Professor right-of-reply.** A whole separate build (professor identity verification, a reply surface, reply moderation) on top of student-only auth (§7) — deferred, revisit only as a post-v1 effort.
- **Interactive course planner** (visual prereq graph + "mark what you've taken" + the recommended-sequence grid, folding in the cut static flowchart from §6). Needs only catalog data — its deferral is **effort/complexity-gated**, not data-gated: it's the largest UI on the map and introduces a third data domain (per-user "taken" state, account-coupled). v1 owes it only the parsed prereq edges (§6); the flowchart-table parser (§9) is not built in v1.
- **Semester load view** (the literal "sum your weekly hours" north-star feature). **Data-gated**, not effort-gated: worthless until ~40–50% of the `COMP` catalog carries N≥2 workload data (§5's floor). Ships as a feature layered onto the interactive planner's surface once that trigger fires — never its own page. Build guardrails for whenever it's built: inherit §5 wholesale (N≥2 to contribute, a range not a confident integer, labeled "from K of N courses," unknowns excluded visibly never zeroed, difficulty shown side-by-side never summed).
- **Static curriculum flowchart** as a standalone page — cut from v1 by [#12](https://github.com/AUReviews/AUReviews/issues/12) (§6); its content folds into the deferred interactive planner.
- **Admin/operator console** (the dashboard UI) — deferred to the later planner/load-view effort; §12 covers how its duties are handled without it in v1. The [#15](https://github.com/AUReviews/AUReviews/issues/15) prototype is that effort's design-of-record when it's built.

Both the interactive planner and the semester load view are **a fresh wayfinder map when their gate is reached, not a resumption of this one.**

---

## 15. Not required for v1, left open

These were deliberately never sharpened into tickets on the map — they don't block building v1, and nothing above depends on them being resolved first:

- **Seed drive, concretely.** Who writes the first ~100 reviews, in which channels (r/auburn, AU CS Discord, SWE GroupMe), timed to which registration week, and what the ask says. What v1 *does* owe the cold start: the catalog (courses, prereqs, Banner offering history back to Fall 2007) must be fully imported and live **before** the review-submission flow opens, so the site is useful on day one even at zero reviews (§1, §6). The tactical recruiting plan is an operator decision to make close to launch, not a build requirement.
- **Success metrics & analytics.** What counts as "working" at 1 month / 1 semester, and what instrumentation to add. Not part of the buildable spec; add later without touching the data model.
- **Instructor-primary pages.** Whether an instructor ever gets a page aggregating across courses, or stays purely a per-course filter facet (§5's current answer). Revisit once review density is understood.
- **Post-v1 catalog expansion.** The path to `CPSC` (§9), then MATH/PHYS/ENGR, then other majors. v1's data model carries no CS-specific assumptions, so this is additive, not a rewrite.
- **Search & discovery beyond browse+sort.** Fuzzy/full-text search across the catalog. v1 ships the click-to-sort table only (§5).

---

## Launch checklist (mechanical, not product decisions)

1. Run the catalog ingest (§8/§9) once, fully, before opening the review-submission flow — the catalog must stand alone from day one.
2. DNS: SPF + DKIM + DMARC on the Resend sending subdomain (§7); verify deliverability into Auburn's M365 tenant before relying on it.
3. Publish ToS, Privacy Policy, Review Guidelines, footer disclaimer (§10/§11); register the DMCA agent; stand up `legal@aureviews.com` (§10/§12).
4. Complete the 🔴 attorney consult (§10) — this gates the name, the ToS/Privacy/Guidelines text, and the retention durations (§11) all becoming final, not just launch-day polish.
5. Confirm both Edge Config flags (§12) default to `moderationMode: "open"`, `readOnly: false`.
6. Then: the seed drive (§15, operator's call, timed to a registration week).
