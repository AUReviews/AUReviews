# Where Auburn CSSE course data comes from

Research for issue #3 (parent map #1). Investigated 2026-08-04 against primary
Auburn sources. Every claim is cited with the URL it came from. Sample records
were retrieved live and are pasted verbatim; nothing here is invented. Items I
could not verify are marked **UNCERTAIN**.

---

## TL;DR / headline findings

1. **There is no `SWEN` course prefix at Auburn.** The ticket/map premise
   "COMP/SWEN course codes" is incorrect. All CSSE-owned undergraduate courses
   carry the **`COMP`** prefix ("Computer Science & Software Engineering"). `SWEN`,
   `CSCI`, and `SENG` are **major/program codes**, not course subjects — the
   Software Engineering degree is built almost entirely out of `COMP` courses.
   A separate **`CPSC`** ("Computer Science") prefix also exists in the bulletin
   index (legacy — see below, **UNCERTAIN** on exact contents).
   Source: bulletin course-of-instruction index lists only **COMP** and **CPSC**
   under computing; SWEN/SENG do not resolve as course pages (404).
   <https://bulletin.auburn.edu/coursesofinstruction/> ,
   `/coursesofinstruction/swen/` → HTTP 404.

2. **The catalog is fully obtainable, no auth.** The official bulletin
   (CourseLeaf/Leepfrog) publishes COMP course code, title, credit hours,
   description, and prerequisites as public HTML.
   <https://bulletin.auburn.edu/coursesofinstruction/comp/>

3. **Prerequisites are semi-structured PROSE, not structured fields** — but the
   prose follows a consistent, parseable "`Pr.`" grammar (course codes + and/or +
   parenthetical grouping + grade thresholds). A prereq graph is buildable with a
   custom parser; there is no ready-made structured prereq field. Examples below.

4. **Section + instructor-of-record data is public and historical.** Auburn's
   legacy **Banner 8 self-service** (`ssbprod.auburn.edu/pls/PROD/…`) serves the
   Class Schedule with CRN, meeting times, location, credits, **and instructor
   name(s)** with **no login**, for **every term back to Fall 2007**. This fully
   gates the "instructor dropdown" requirement.
   <https://ssbprod.auburn.edu/pls/PROD/bwckschd.p_disp_dyn_sched>

5. **Degree plans are published as parseable semester-by-semester HTML tables**
   in the bulletin, tagged by catalog year, with a PDF export. No separate
   flowchart PDF is needed.

---

## 1. Course catalog source — bulletin (authoritative)

- **Primary source:** Auburn University Bulletin, "Courses of Instruction",
  COMP page. Platform is CourseLeaf (Leepfrog Technologies). Public, server-
  rendered HTML (not JS-gated).
  <https://bulletin.auburn.edu/coursesofinstruction/comp/>
- **Current catalog year:** 2026-2027 (as displayed on the program pages).
- **Yields per course:** course code, title, credit hours (with LEC/LAB
  breakdown), full description, prerequisites, and corequisites where present.

### Sample records (pasted verbatim from the COMP page)

Lower-division (no prereqs):

> **COMP 1000 PERSONAL COMPUTER APPLICATIONS (2)** — "Introduction to personal
> computers and software applications, including word processing, spreadsheets,
> databases, and presentation graphics; generation and retrieval of information
> with the Internet; integration of data among applications." Prerequisites: none.

> **COMP 1201 INTRODUCTION TO COMPUTING LABORATORY (1)** — "Laboratory activities
> focused on computer programming in a high-level language." Coreq. COMP 1200.

Upper-division (real prereq text, verbatim):

> **COMP 2210 FUNDAMENTALS OF COMPUTING II (4)** — "LEC. 3. LAB. 3. Pr. COMP 1210
> or COMP 1213. Software development in the context of collections (e.g., lists,
> trees, graphs, hashtables). Communication, teamwork, and a design experience
> are integral course experience. Pr. COMP 1210 with a grade of C or higher."

> **COMP 3220 PRINCIPLES OF PROGRAMMING LANGUAGES (3)** — "LEC. 3. Pr. COMP 2210
> or COMP 2213. Study of programming language principles supporting procedural
> abstraction, data abstraction, storage allocation, and parallel execution;
> language types and examples; language translations. Pr. COMP 2210 with a grade
> of C or higher."

> **COMP 3270 INTRODUCTION TO ALGORITHMS (3)** — "LEC. 3. Pr. COMP 2240 and
> (COMP 2210 or COMP 2213). Algorithms for standard computational problems and
> techniques for analyzing their efficiency; designing efficient algorithms and
> experimentally evaluating their performance. Pr. COMP 2210 & 2240, both with a
> grade of C or higher."

> **COMP 3500 INTRODUCTION TO OPERATING SYSTEMS (3)** — "LEC. 3. Pr. (COMP 2710
> or COMP 2713) and (COMP 3350 or COMP 3353 or ELEC 2220). Structure and functions
> of operating systems; processes and process scheduling; synchronization and
> mutual exclusion; memory management; auxiliary storage management; resource
> allocation and deadlock; security, privacy, and ethical concerns; design
> tradeoffs."

> **COMP 3700 SOFTWARE MODELING AND DESIGN (3)** — "LEC. 3. Pr. COMP 2710.
> Current processes, methods, and tools related to modeling and designing software
> systems. Communication, teamwork, and a design experience are integral course
> experiences."

Source for all of the above:
<https://bulletin.auburn.edu/coursesofinstruction/comp/>

### Prerequisite format — the load-bearing detail

Prerequisites are **published as prose**, but the prose is regular. The grammar
observed across COMP courses:

- Literal `Pr.` (prerequisite) and `Coreq.` markers.
- Course tokens like `COMP 2210`.
- Boolean `and` / `or`.
- Parenthetical grouping: `(COMP 2710 or COMP 2713) and (COMP 3350 or COMP 3353 or ELEC 2220)`.
- Grade thresholds: `with a grade of C or higher`, sometimes stated in a second
  redundant `Pr.` sentence (e.g. COMP 2210, COMP 3220 each restate the C-or-higher
  rule).
- Cross-department prerequisites appear (e.g. `ELEC 2220`), so the parser cannot
  assume prereqs are COMP-only.

**Verdict on structure:** semi-structured prose. A boolean prereq graph is
buildable, but requires a purpose-built parser and hand-verification of edge
cases (the redundant restatements, cross-listed alternatives like
`COMP 2210 or COMP 2213`). It is **not** delivered as machine-readable fields.

### CPSC prefix — UNCERTAIN

The bulletin index lists a separate `CPSC` = "Computer Science" prefix alongside
COMP. <https://bulletin.auburn.edu/coursesofinstruction/cpsc/> resolves. It
appears to be a legacy/alternate numbering. I did **not** independently verify the
individual CPSC course numbers/titles (the single automated fetch of that page
returned a list I could not cross-check and may be unreliable). **Action for
implementation:** confirm whether CPSC is (a) dead legacy, (b) an alternate
catalog, or (c) a distance/second-track numbering, before deciding whether the
v1 catalog must include it. v1 scope (per map) is COMP.

---

## 2. Section, term-offering, and instructor data — Banner 8 (public)

Auburn runs two self-service stacks. The **legacy Banner 8** one is the useful,
unauthenticated one:

- **Host / base:** `https://ssbprod.auburn.edu/pls/PROD/`
- **Class Schedule Search entry (public, term dropdown):**
  <https://ssbprod.auburn.edu/pls/PROD/bwckschd.p_disp_dyn_sched>
  Dropdown lists every term **Fall 2026 back through Fall 2007**; recent past
  terms are marked "(View only)". This is the historical depth available for the
  instructor dropdown — ~18 years.
- **Catalog/section listing endpoint (public, no login):**
  `bwckctlg.p_disp_listcrse?term_in=<TERM>&subj_in=COMP&crse_in=<NUM>&schd_in=%25`

**Live sample retrieved (verbatim), COMP 3270 "Introduction to Algorithms":**

Fall 2026 (`term_in=202710`):
- Sec 001, CRN 15989, MWF 10:00–10:50am — **Saad Biaz**
- Sec 002, CRN 18236, MWF 12:00–12:50pm — **Vishalini Laguduva Ramnath**
- Sec 003, CRN 15990, TR 11:00–12:15pm — **William Haynes Heaton**
  Source: <https://ssbprod.auburn.edu/pls/PROD/bwckctlg.p_disp_listcrse?term_in=202710&subj_in=COMP&crse_in=3270&schd_in=%25>

Fall 2025 (`term_in=202610`):
- Sec 001, CRN 17561, TR 9:30–10:45am — **Vishalini Laguduva Ramnath**
- Sec 003, CRN 17563, TR 9:30–10:45am — **William Haynes Heaton**
  Source: <https://ssbprod.auburn.edu/pls/PROD/bwckctlg.p_disp_listcrse?term_in=202610&subj_in=COMP&crse_in=3270&schd_in=%25>

A second sample (`bwckctlg.p_disp_listcrse` for KINE 3300, Spring 2020,
`term_in=202020`) returned CRN 12367, meeting times, room "Student Activities
Ctr 249", credits 3.0, and instructors "Brenna Marie Cosgrove (primary), Jessica
Richards Grimes, Sheri J Thornburg-Brock" — confirming the endpoint exposes
**primary vs. secondary instructor** and room/time, not just a name.
Source: <https://ssbprod.auburn.edu/pls/PROD/bwckctlg.p_disp_listcrse?term_in=202020&subj_in=KINE&crse_in=3300&schd_in=LLB>

**Term-code scheme (derived from the samples):** `YYYYT0` where the 4-digit
prefix is the academic year's spring calendar year and the 5th digit is the
semester: **10 = Fall, 20 = Spring, 30 = Summer**. So Fall 2026 = `202710`,
Fall 2025 = `202610`, Spring 2020 = `202020`, and Spring 2027 would be `202720`,
Summer 2027 `202730`. (Derived, high-confidence, but validate against the live
dropdown values before hardcoding.)

**Bulk retrieval note:** the classic Banner 8 results page
`bwckschd.p_get_crse_unsec` takes a form POST and returns all sections for a
subject/term at once; the `bwckctlg.p_disp_listcrse` GET used above is the
simplest per-course scrape and is confirmed working. Either way this is HTML
scraping of a public endpoint — there is **no documented JSON API** on the
Banner 8 host.

### Banner 9 (the newer stack) — mostly gated

- **Host:** `https://erpssb.auburn.edu/StudentRegistration/ssb/…`
  (e.g. `/StudentRegistration/ssb/registration`).
  Source: <https://erpssb.auburn.edu/StudentRegistration/ssb/registration>
- "Search and Register", "Search and Plan", registration history etc. explicitly
  require login. Some "browse classes / course information" links exist, but I did
  **not** confirm an unauthenticated JSON path. The Banner 9 self-service JSON the
  ticket hypothesized (`/StudentRegistrationSsb/ssb/searchResults/searchResults`)
  was **not** confirmed reachable on Auburn — the deployed path is
  `/StudentRegistration/ssb/` (no `Ssb` suffix), and I could not verify it serves
  results without a session. **Since Banner 8 already exposes everything publicly,
  Banner 9 is not needed.**
- The registrar's own Banner 9 landing page is behind SAML SSO
  (`authenticate-d.auburn.edu`), so registrar-side links are not scrapable.

---

## 3. Curriculum / degree-plan data — bulletin HTML tables

Both undergraduate CSSE degrees publish a **semester-by-semester plan of study as
an HTML table** (Freshman→Senior, Fall/Spring columns, code + title + hours),
tagged with the catalog year (currently 2026-2027), with a PDF export button.

- **Computer Science (CSCI major):**
  <https://bulletin.auburn.edu/undergraduate/samuelginncollegeofengineering/departmentofcomputerscienceandsoftwareengineering/computerscience_major/>
  Freshman year verbatim:
  Fall — ENGL 1100 (3), Core Science Seq. (4), MATH 1610 Calculus I (4),
  COMP 1210 Fundamentals of Computing I (3), ENGR 1110 (2), ENGR 1100 (0).
  Spring — ENGL 1120 (3), Core Science Seq. (4), MATH 1620 Calculus II (4),
  COMP 2210 Fundamentals of Computing II (4), COMP 2240 Discrete Structures (3).

- **Software Engineering (SENG/SWEN major):**
  <https://bulletin.auburn.edu/undergraduate/samuelginncollegeofengineering/departmentofcomputerscienceandsoftwareengineering/softwareengineering_major/>
  Freshman year is identical to CS at the freshman level (same COMP 1210 / 2210 /
  2240 spine); the degrees diverge in later years. Courses are COMP-prefixed.

- **eng.auburn.edu** program pages
  (<https://www.eng.auburn.edu/program/bachelor-of-science-computer-science.html>)
  carry marketing copy only and **link back to the bulletin** for the actual
  curriculum — no separate downloadable flowchart/check-sheet PDF was found.

**Parseability:** good. HTML tables are structured; catalog year is explicit, so
per-catalog-year plans can be captured by fetching the year-scoped bulletin URL.

---

## 4. Historical stability / durable identity

- **Catalog is versioned by year** (2026-2027 now); CourseLeaf keeps prior years
  (though `/archivedbulletins/` is disallowed in robots — see below).
- **Renumbering has happened** — the parallel `CPSC` (Computer Science) prefix vs.
  the current `COMP` (Computer Science & Software Engineering) prefix, plus the
  `or COMP 2213`-style alternates in prereqs, are evidence that course numbers
  drift across catalog years. **UNCERTAIN** whether Auburn exposes any stable
  surrogate key (there is no visible permanent course ID in the public HTML). The
  practical durable identifier for PlainsCourses is the tuple `(subject, number)`
  as of a catalog year; treat a renumber as a new course with a manual alias/merge
  rather than assuming an official stable ID exists.

---

## 5. Feasibility, permission, and refresh cadence

**robots.txt:**
- Bulletin (<https://bulletin.auburn.edu/robots.txt>) disallows admin/tooling
  paths — `/admin/`, `/courseleaf/`, `/cim/`, `/courseadmin/`, `/programadmin/`,
  `/archivedbulletins/`, `/search/`, `/pdf/`, assets, etc. — but **does NOT
  disallow `/coursesofinstruction/` or `/undergraduate/`**, i.e. the exact pages
  we need are crawl-permitted. Note `/archivedbulletins/` and `/pdf/` are
  disallowed, so prefer the live year-scoped HTML pages over archived/PDF fetches.
- Banner host (<https://ssbprod.auburn.edu/robots.txt>) → **404, no robots.txt**,
  so no declared crawl restriction on the public schedule endpoints.
- Terms of use: I could not locate an explicit bulletin "terms of use" page
  (`/aboutthebulletin/` → 404). Data is factual/public-record catalog data;
  scraping the crawl-permitted pages at a polite rate is defensible, but a legal-
  posture ticket should confirm before launch. Do not scrape the SSO-gated
  registrar or Banner 9 authenticated areas.

**Refresh cadence:**
- **Catalog / descriptions / prereqs / degree plans:** change ~**annually** with
  the new catalog year (plus occasional mid-year edits). An annual full refresh
  plus a lightweight monthly diff is sufficient.
- **Term offerings + sections + instructors:** change **each term** as scheduling
  and registration open. Refresh **per term** (weekly during the
  build/registration window would catch instructor and section changes).

---

## 6. Prior art

- **`salzbrenner/aucs-course-portal`** — "Auburn Computer science class rating
  app", live at <https://aucs-classes.netlify.app/>. The closest existing project
  to PlainsCourses. Repo contents were **not retrievable** via the GitHub API
  (tree/contents came back empty), so its data pipeline could not be inspected —
  worth a manual look. <https://github.com/salzbrenner/aucs-course-portal>
- Many personal "my Auburn coursework" repos exist (`hzs0084/Auburn`,
  `eristenn/Auburn-Computer-Science-Courses`, `midas-kingme/Auburn-Courses`,
  etc.) — these are assignment dumps, **not** catalog datasets or scrapers.
- **No comprehensive public Auburn course dataset or maintained scraper was
  found.** PlainsCourses will build its own ingestion.

---

## Recommended sourcing approach

| Data | Source | Access | Structure | Verdict |
|---|---|---|---|---|
| **Course catalog** (code, title, credits, description) | Bulletin CourseLeaf `/coursesofinstruction/comp/` | Public HTML, crawl-permitted | Server-rendered HTML | **Feasible — easy.** Scrape annually. |
| **Prerequisites** | Same bulletin pages | Public | Semi-structured **prose** (`Pr.` grammar) | **Feasible — medium.** Prereq graph buildable via custom parser + hand-verify; not machine-structured. |
| **Term offerings** | Banner 8 `ssbprod.auburn.edu/pls/PROD/bwckschd`/`bwckctlg` | **Public, no login** | HTML scrape, no JSON API | **Feasible.** Term codes `YYYYT0`. Refresh per term. |
| **Per-section instructor-of-record** | Same Banner 8 endpoints | **Public, no login**, back to **Fall 2007** | HTML, primary vs. secondary flagged | **Feasible — this is the win.** Powers the instructor dropdown, with history. |
| **Degree flowcharts / plans** | Bulletin major pages (CS, SWE) | Public HTML | Semester tables, per catalog year | **Feasible.** Parse HTML tables; no flowchart PDF needed. |

**Net:** everything v1 needs (full COMP catalog, prereq chains, term offerings,
degree plans, and historical per-section instructors) is obtainable from two
public Auburn hosts with **no authentication** — the bulletin for catalog/prereqs/
degree plans, and legacy Banner 8 for sections/instructors. There is **no JSON
API**; all ingestion is HTML scraping of crawl-permitted or robots-silent pages.
The one real modeling cost is the **prose prerequisite parser**. The one premise
to correct upstream: **there is no SWEN course code — it's all COMP.**

### Open items to hand off
- Confirm the status/contents of the `CPSC` prefix (legacy vs. active) before
  finalizing catalog scope.
- Confirm whether any stable course surrogate key exists across catalog years
  (assume not; plan manual renumber aliases).
- Legal-posture ticket: confirm scraping terms before public launch.
- Manually inspect `aucs-course-portal` for reusable ingestion ideas.
