# Reference sites, dissected from source

Research for [PlainsCourses#2](https://github.com/PlainsCourses/PlainsCourses/issues/2). All claims below are cited to the actual repositories (read from `git clone` of each), the live sites, or named web sources. Repo citations use `owner/repo:path`. The three repos were read at their current `main`/`master` as of 2026-08-04.

- **omscentral** — `oms-fyi/reviews` (Next.js 16 + Sanity CMS + Vercel). Primary model.
- **MSCSHub** — `MSCSHub/MSCSHub` (Angular 18 + Firebase, multi-tenant UT Austin MSCS/MSDS/MSAI).
- **uiucmcs** — `uiuc-mcs/uiuc-mcs` (Angular 20 + Firebase, GitHub Pages hosting).

> Note on omscentral: the repo is a **current rewrite**. `git log` shows the Sanity data layer was added recently (`2453b8a Add sanity schemas and studio route`, on top of `Upgrade to Next 16`). Earlier omscentral (the `oms-tech/reviews` era) used a different backend; the schema below is what ships today. The course-page "Tell us more" link still points at `github.com/oms-tech/reviews` (`oms-fyi/reviews:src/app/courses/[slug]/reviews/page.tsx` line ~97), confirming the lineage.

---

## 1. omscentral (`oms-fyi/reviews`) — the primary model

### Stack and data layer
- **Framework:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4. `oms-fyi/reviews:package.json`.
- **Data layer / CMS:** **Sanity** — a hosted headless CMS. `@sanity/client`, `sanity`, `next-sanity`, `groq` in `package.json`. The content schema is code (`oms-fyi/reviews:src/sanity/schemaTypes/*`) and the editing UI is **Sanity Studio mounted in-app at `/studio`** (`oms-fyi/reviews:sanity.config.ts`, `basePath: "/studio"`). Content is authored by admins in Studio and queried with GROQ (`oms-fyi/reviews:src/sanity/queries/index.ts`).
- **Hosting:** Vercel. `@vercel/analytics`, `@vercel/speed-insights`, `@sentry/nextjs` are wired in. The app is statically generated per-course (`generateStaticParams` in the course reviews page) with `dynamicParams = true` so newly-added courses render on first request.
- **Other services:** **Twilio Verify** for email OTP (`oms-fyi/reviews:src/twilio/api.ts`); Sentry for error tracking.
- **Cost at zero revenue:** Effectively free to low. Sanity's **free plan is free forever**: ~20 seats, 2 datasets, **10,000 documents**, ~100 GB assets/bandwidth (limits vary by source: [Sanity pricing 2026](https://costbench.com/software/headless-cms/sanity/), [robotostudio breakdown](https://robotostudio.com/blog/sanity-cms-pricing-which-plan-is-right-for-you)). The binding constraint is the **10,000-document cap** — and every review is a document, so a busy site eventually crosses into the Growth plan ($15/occupied seat/mo). Vercel hobby + Twilio pay-per-verification (fractions of a cent per email) round out a near-zero monthly bill at launch scale.

### Review schema — reproduced field-by-field
Source of truth: `oms-fyi/reviews:src/sanity/schemaTypes/reviewType.ts`, with server-side validation in `oms-fyi/reviews:src/app/api/reviews/route.ts` (Joi).

| Field | Type | Scale / rule | Notes |
|---|---|---|---|
| `course` | reference → `course` | required | The rated unit is the **course**. |
| `semester` | reference → `semester` | optional in schema; **required** by the submit form/API | `semester` doc = `{term: spring\|summer\|fall, startDate: date}`. |
| `body` | text (plain string; rendered as Markdown) | required (API) | Free-text review. Rendered with `react-markdown` + `rehype-sanitize`. |
| `rating` | number | integer **1–5** | "Overall, how would you rate this course?" |
| `difficulty` | number | integer **1–5** | |
| `workload` | number | integer **1–100**, unit = **hours/week** | The signature metric. Form labels it "hours / week". |
| `authorId` | string, read-only | AES-256-CBC **encrypted GT username** | Set server-side; not user-editable. |

- **There is NO instructor / professor field of any kind.** Not as an entity, not as a free-text field, not as a rating dimension. A review is anchored to `course` + `semester` only.
- `body`, `rating`, `difficulty`, `workload` are all **required** at submit time (`new-page.tsx` marks each input `required`; the API Joi schema requires all of them).

### Aggregation and display
- **Averages:** plain arithmetic mean, computed at request time from the raw reviews — `oms-fyi/reviews:src/util/math.ts` (`sum/count`, skipping null/0). The course index pulls all reviews per course via `GET_COURSES_WITH_REVIEWS_STATS_QUERY` and computes rating/difficulty/workload means + `reviewCount` client-side (`oms-fyi/reviews:src/app/home-page.tsx`).
- **Minimum review count:** **none.** A single review sets the displayed average. (There is a *filter* to hide courses below a chosen review count, but no floor on display.)
- **Index table sort/filter** (`home-page.tsx`): default sort = **`reviewCount` desc**. Sortable by name, rating, difficulty, workload, review count. Filters: min/max for review-count, rating, difficulty, workload; toggles for "has lecture notes", "foundational only", "hide deprecated". Search is **client-side fuzzy** via `fuse.js` over `name`/`tags`/`codes`. Pagination 10/25/50.
- **Course page above the fold** (`src/app/courses/[slug]/reviews/page.tsx`): course name, then a one-line stat bar — `rating /5`, `difficulty /5`, `workload hrs/week` (only shown if reviews exist) — then a "Quick Facts and Resources" card (codes/cross-listings, credit hours, programs, description, syllabus link, textbooks) beside the review list. Each review card shows the (encrypted) author token, date, semester, the markdown body, and Rating/Difficulty/Workload pills. Empty state: a "No reviews — write one" CTA, so the page is useful before any review exists.

### Auth and submission flow
- **No account, no login, no password.** Reviewing is a one-shot verified action per submission (`oms-fyi/reviews:src/app/reviews/new/new-page.tsx`).
- **What's verified:** ownership of a **`@gatech.edu`** address. User types a GT username; `/api/verifications` sends a 6-digit code to `{username}@gatech.edu` via **Twilio Verify (email channel)** (`src/twilio/api.ts`, `sendCodeToUser` hard-codes `@gatech.edu`). Code valid 10 min. On submit, `/api/reviews` re-checks the code against Twilio (`doesUserCodeMatch`) before writing.
- **Anti-spam:** Twilio's own rate limiting (`MAX_ATTEMPTS_REACHED` → "Too many send attempts"); `body` required; the encrypted `authorId` is stored so an admin can correlate a person's reviews. There is **no enforced one-review-per-course** rule in code.
- **Edit / delete:** **not possible for users.** There is no PUT/DELETE route and no auth session to authorize one. Corrections happen only via an admin in Sanity Studio.
- **Anonymity nuance worth flagging:** reviews are pseudonymous, not anonymous — the course page passes `review.authorId` (the encrypted token) as the displayed "author", so all reviews by one person share a stable visible token. (`page.tsx` → `<Review author={review.authorId} …>`.)

### Moderation
- **Post-hoc, admin-only, via Sanity Studio.** New reviews are `create()`d and returned `201` immediately (`api/reviews/route.ts`) — they appear on the site with **no pre-publish queue**. Moderation = an admin editing/deleting in `/studio`. No published moderation policy is in the repo. Catalog corrections are crowdsourced through a GitHub issue template (`oms-fyi/reviews:.github/ISSUE_TEMPLATE/course-edit-request.md`).

### Cold start
- **No seed/import script in the repo.** Origin per primary web sources: omscentral grew out of the OMSCS-Tech community built by **Matt Schlenker** alongside omscs-notes.com ([Buy Me a Coffee / OMSTech](https://buymeacoffee.com/omstech)). The widely-repeated community account is that it superseded an earlier community-maintained review spreadsheet, but I could **not confirm the spreadsheet handoff from a primary source** — stating it plainly rather than guessing. What *is* in-repo is the ongoing catalog-maintenance mechanism (GitHub issue templates for course edits).

---

## 2. MSCSHub (`MSCSHub/MSCSHub`) — the maximalist contrast

### Stack and data layer
- **Angular 18** (standalone components, Angular Material, Flex-Layout) — `MSCSHub/MSCSHub:package.json`. README says the frontend was originally Angular 14.
- **Backend = Firebase, serverless:** `@angular/fire` + `firebase` SDK talking directly to **Cloud Firestore**, plus **Node.js Cloud Functions** for aggregation (README: "The backend is serverless and runs off of firebase with node.js functions"). Firebase **Auth** for accounts. **Firebase Hosting** (deploy scripts in `package.json`). The checked-in `firestore.rules` is a deny-all placeholder — real rules are deployed out of band.
- **Multi-tenant:** one codebase serves three UT Austin programs — MSCS, MSDS, MSAI (`deploy-mscs`/`-msds`/`-msai` build configs; `isComputerScience`/`isDataScience`/`ai` flags on every course and review). Cost: Firebase Spark (free) tier for a small site; Firestore reads dominate cost as traffic grows.

### Review schema — the richest of the three
Source: `MSCSHub/MSCSHub:src/app/shared/review/review.ts` and the form in `src/app/reviews/create-review/create-review.component.ts`. **All rating dimensions use a 1–7 scale** ("Miller's law" — see the in-code `scaleTooltip`).

| Field | Scale / unit | Notes |
|---|---|---|
| `rating` | **1–7** | Overall. |
| `difficulty` | **1–7** | 1 = easiest. |
| `workload` | integer **1–50** (hint) / validated 1–100, **hrs/week** | |
| `bookUsefulness` | **0–7** | 0 = no textbook. |
| `lectureQuality` | **1–7** | |
| `professorQuality` | **1–7** | "aggregate quality of the professor(s)" — a **rating dimension, not a named instructor entity**. |
| `piazzaCommunity` | **1–7** | Piazza/community support. |
| `review` | free text | Pre-filled Pros/Cons/Detailed template; **~100-word minimum** nudged via a "too short" dialog. |
| `title`, `course`, `semester`, `year` | | Term recorded as season + year. |
| `degreeProgram` / `isComputerScience` / `isDataScience` | enum/bool | Tags the review to program(s). |
| `helpfulPositive`, `helpfulNegative`, `wilsonScore` | numbers | **Helpful-voting** + Wilson score for ranking reviews. |
| `peerReviewed` | bool | Community-moderation flag. |
| `userId` | Firebase uid | Owner. |

- **Instructor is still not a first-class entity** — it survives only as `professorQuality` (a number) and as a scraped `Teacher` string on the course. No per-instructor filtering of reviews.

### Aggregation and display
- **Denormalized precomputed averages** stored on the course document (`ClassData` in `src/app/shared/class/class.ts`): `RatingAvg`/`RatingCount`, `DifficultyAvg`/`DifficultyCount`, `WorkloadAvg`, `ProfessorQualityAvg`, `LectureQualityAvg`, `BookUsefulnessAvg`, `PiazzaCommunityAvg`, each with its own count. Recomputed on submit (`updateCourseData()` / Cloud Functions).
- **Review list** (`src/app/reviews/reviews.component.ts`): Firestore-paginated (5/page, cursor `startAfter`). Sort options: **Most/Least Helpful (`wilsonScore`)**, Newest, Oldest. Ad-hoc filter by any metric with an operator (`==,!=,<,>,<=,>=`). No minimum-review-count floor.

### Auth and submission flow
- **Persistent Firebase account** (email + password), `signUp` collects **real first/last name + first semester** (`src/app/services/auth/auth.service.ts`). Verification = **Firebase `sendEmailVerification()` link** — and critically **any email domain is accepted**; there is *no* university-domain restriction. So "verified" means "controls an inbox", not "is a UT student."
- **Editable & tracked:** reviews can be **edited** (`update` by `reviewId`); the form tracks the user's `completedReviews` to enforce ~one review per course. Helpful votes recorded per-user in `UserExtraData.reviewFeedback`.

### Moderation
- Post-hoc, community-assisted: **helpful up/down voting**, a `peerReviewed` flag, and `wilsonScore` sink low-quality reviews. Word-count nudge raises baseline quality. No pre-publish queue evident.

### Cold start
- **Catalog was scraped**, with a primary artifact in-repo: `MSCSHub/MSCSHub:courseScraper.md` is a browser-console script that scrapes course name, **professor**, category, and thumbnail from the official UT MSCS online course page. That's concrete evidence the *catalog* was bootstrapped by scraping the university site. No evidence of seeded/imported *reviews* — those appear organically community-sourced. README credits beta testers ("#koolkidz") and donors, implying a hand-run community launch.

---

## 3. uiucmcs (`uiuc-mcs/uiuc-mcs`) — the lean, closest-to-our-auth fork

### Stack and data layer
- **Angular 20** + `@angular/fire` + **Firestore** + Firebase **Auth**. `chart.js` for course stat charts. `uiuc-mcs/uiuc-mcs:package.json`.
- **Hosting: GitHub Pages** (free static hosting) with a custom domain — `deploy` script runs `gh-pages` with `--cname=uiucmcs.org`; there's a `CNAME` file. So it's a static Angular bundle that talks straight to Firestore from the browser. Near-zero hosting cost.
- **Aggregation is pure client-side** (no Cloud Functions): `uiuc-mcs/uiuc-mcs:src/app/services/review-aggregate/review-aggregate.service.ts` reads all reviews for a course and `updateDoc`s the denormalized `RatingAvg/Count`, `DifficultyAvg/Count`, `WorkloadAvg/Count` on the `Class` doc right after a review is submitted.

### Review schema — the minimal set (mirrors omscentral's three metrics)
Source: `uiuc-mcs/uiuc-mcs:src/app/shared/review/review.ts` + form `src/app/reviews/review-create/review-create.component.ts`.

| Field | Scale / unit | Notes |
|---|---|---|
| `rating` | **1–5**, labeled "Strongly Disliked … Strongly Liked" | |
| `difficulty` | **1–5**, "Very Easy … Very Hard" | |
| `workload` | integer **1–168**, hrs/week | |
| `review` | free text, **min 100 chars** enforced | |
| `title`, `course`, `classNumber`, `semyear` (semester+year) | | Term recorded. |
| `helpfulPositive`, `helpfulNegative`, `wilsonScore` | | Helpful-voting + Wilson ranking. |
| `userId`, `reviewId` | | |

- **No professor/instructor field at all** — same as omscentral. Just the three headline metrics + prose.

### Aggregation, display, extras
- Simple means on the `Class` doc; **no minimum review count**. Course browse (`src/app/courses/course-grid/course-grid.component.ts`) filters by **category** and **programming language** chips, sorted alphabetically. Reviews sortable by helpfulness/recency; `review-helpfulness` component for voting; `chart.js` course charts for metric distributions.
- **Zero-review value add:** a full **course Planner** (`src/app/planner/…`) with static category/course constants (`planner/constants/course-data.constants.ts`) and MCS/MCSDS category taxonomies baked into `class.ts`. This is their "useful while empty" surface — catalog + planner stand without any reviews. Directly relevant to PlainsCourses' "useful with zero reviews" premise.

### Auth and submission flow — closest to PlainsCourses
- Firebase email/password account, `signUp` collects name + first semester, then **`sendEmailVerification()`**.
- **Domain-restricted:** the register form enforces `@illinois.edu` (incl. subdomains) via regex — `uiuc-mcs/uiuc-mcs:src/app/user/register/register.component.ts` (`emailRegex = "…illinois\.edu"`). This is the same shape as PlainsCourses' intended `@auburn.edu` gate: **university-domain email + Firebase verification link**, persistent account.
- Reviews are **editable and deletable by the owner** (`review-create` edit path; `shared/dialog/review-delete/dialog-on-delete.component.ts`).

### Moderation
- Owner edit/delete + helpful-voting + Wilson ranking + a 100-char minimum. There is an **`admin` component and `admin-guard`** (`src/app/user/admin/…`) → role-based admin moderation exists, though the checked-in admin component is a stub. No pre-publish queue.

### Cold start
- No in-repo seed evidence; catalog course/category data is partly **static constants** in the bundle (`planner/constants`, `class.ts`). Community-sourced reviews. Site describes itself as an unofficial student resource.

---

## Cross-cutting comparison

| | omscentral | MSCSHub | uiucmcs |
|---|---|---|---|
| Stack | Next.js 16 + Sanity | Angular 18 + Firebase + Cloud Functions | Angular 20 + Firebase |
| Hosting | Vercel | Firebase Hosting | **GitHub Pages** (static) |
| Content authoring | Admin in Sanity Studio | Firestore (+scraped catalog) | Firestore (+static catalog constants) |
| Rating scale | **1–5** | **1–7** | **1–5** |
| Rating dimensions | rating, difficulty, workload | rating, difficulty, workload, book, lecture, **professor**, piazza | rating, difficulty, workload |
| Workload unit | hrs/week (1–100) | hrs/week (1–50/100) | hrs/week (1–168) |
| Instructor captured? | **No** | Only as `professorQuality` number + scraped `Teacher` string | **No** |
| Term recorded? | Yes (semester ref) | Yes (season+year) | Yes (semester+year) |
| Account? | **No — one-shot OTP** | Yes (persistent) | Yes (persistent) |
| Verifies | `@gatech.edu` via Twilio OTP | **any email** via Firebase link | **`@illinois.edu`** via Firebase link |
| Edit/delete own review | No | Edit | Edit + delete |
| Min review count for display | No | No | No |
| Default review sort | (course index by reviewCount) | Newest / Wilson helpful | Newest / Wilson helpful |
| Moderation | Post-hoc, admin in Studio | Post-hoc + helpful voting/Wilson | Post-hoc + voting + admin role |
| Catalog cold-start | GitHub issue edits | **Console scraper** of official site | Static constants + Firestore |

**The context caveat that runs through all three:** every one of these serves a *single, cohesive, online masters cohort* taking a *small, standardized catalog* of courses. That is why **none of them treats the instructor as a first-class entity** — in OMSCS/UT-MSCS a given course is essentially the same product each term regardless of who nominally runs it, so "the course" is a stable rated unit and the instructor barely matters. Their audiences are also narrow (grad students, one program), so "any verified email can post" (MSCSHub) or "one shared cohort" assumptions hold.

---

## What PlainsCourses should copy, adapt, or reject

### Copy
- **The three-metric numeric core: overall rating + difficulty + workload-in-hours/week, all required.** Shared by omscentral and uiucmcs; it *is* PlainsCourses' north star ("honest workload numbers"). Keep workload as an integer hours/week with a generous max (uiucmcs uses 168; 1–100 is plenty).
- **Term-on-the-review** (semester + year). All three do it; it's what lets a reader weight recency and lets you show trends.
- **Catalog + structure that stands with zero reviews.** uiucmcs's planner/category/prereq surfaces and omscentral's per-course "Quick Facts" card (codes, credit hours, description, syllabus, textbooks) both make the empty state useful — exactly the v1 premise. Copy this shape.
- **Client-side fuzzy search + rich filter/sort over a denormalized per-course stat row** (omscentral's `fuse.js` index; uiucmcs's category/language chips). Cheap, fast, no server needed.
- **A crowdsourced catalog-correction channel** (omscentral's GitHub issue template) — low-effort way to keep course data honest.

### Adapt
- **Auth = university-domain email + verification. Follow uiucmcs's `@illinois.edu`-regex model → `@auburn.edu`.** It matches the settled PlainsCourses policy exactly and is the cleanest fit. omscentral's Twilio-OTP-without-account is elegant (no password, no session to secure, nothing to breach) and worth considering as the *mechanism*, but note it verifies domain **at submit time only** and stores a reversible-encrypted identifier — fine for them, but PlainsCourses wants display-anonymous reviews, so if you adopt OTP, store a **one-way hash** (not reversible AES) of the email for dedupe, and never render it.
- **Aggregation: plain mean is fine to start** (omscentral/uiucmcs), but **because the Auburn audience and review pool will be thin per course, add a "based on N reviews" count everywhere and consider suppressing/greying an average below a small N** (e.g. hide the number until ≥3). None of the references enforce a minimum, but they had cohort density PlainsCourses won't have at launch.
- **Helpful-voting + a Wilson/confidence sort** (MSCSHub, uiucmcs) is a good post-hoc moderation lever *once you have volume*; defer it past v1 but design the schema with `helpfulPositive/Negative` so you don't migrate later.
- **A short free-text minimum** (MSCSHub/uiucmcs ~100 chars/words) to push structured, useful prose. Adopt a soft minimum.
- **Hosting/data layer:** all three are cheap. Given the settled **TS/React/Next.js** stack, omscentral's **Next.js + Vercel** is the natural fit. **Sanity is the one to scrutinize:** it's genuinely convenient (Studio gives you a free admin CMS), but the **10k-document free cap counts every review as a document** — plan for the Growth plan ($15/seat/mo) eventually, or use a plain Postgres (e.g. Neon/Supabase free tier) if you'd rather not meter documents. uiucmcs proves you can run this whole category on **GitHub Pages + a database SDK for ~$0**.

### Reject (or handle differently because our context differs)
- **Reject "instructor is not modeled."** This is the single biggest non-transferable design choice. All three omit instructor precisely because their courses don't vary by instructor. **Auburn undergrad courses do** — the same COMP course under different professors is a materially different experience, and PlainsCourses has already settled that **instructor is a field on the review, filterable on the course page**. Do *not* copy omscentral/uiucmcs's instructor-less schema; add an `instructor` field (free-text or a light reference) to every review from day one. (MSCSHub's `professorQuality` number is not enough — you need the instructor's identity to filter, not just a quality score.)
- **Reject MSCSHub's "any email is fine" verification.** That works for a self-selected grad cohort; a public undergrad launch needs the `@auburn.edu` gate to keep the review pool trustworthy and to anchor the audience to actual students.
- **Reconsider the 1–7 scale.** MSCSHub's Miller's-law argument is real, but a **fragmented four-class-year undergrad audience** will find 1–5 more legible and will produce more consistent data; omscentral and uiucmcs both use 1–5. Prefer 1–5.
- **Don't inherit MSCSHub's seven-dimension form wholesale.** Book/lecture/piazza-community dimensions are grad-seminar-specific and will tank completion rates for a broad undergrad audience. Keep the required set tight (rating, difficulty, workload, instructor, term, prose); everything else is optional at most.
- **Don't rely on the references for a moderation *policy*.** All three moderate post-hoc with no published policy — acceptable for a small grad community, but a **public undergrad site with real defamation/abuse exposure** (a map premise) needs an actual written policy and a takedown path, which none of these provide. That's PlainsCourses' own work, not something to copy.

### Cold-start takeaway
The transferable lesson is **catalog-first**: MSCSHub scraped the official course list; uiucmcs baked catalog/planner data into the bundle; omscentral crowdsources catalog edits. **PlainsCourses should seed the full CSSE catalog + prereq chains + planner up front** (a data-entry job, per the map) so the site is valuable on day one, then run a genuine human seed drive for the first reviews — none of the three faked review density by importing third-party corpora, consistent with the map's decision to rule that out.
