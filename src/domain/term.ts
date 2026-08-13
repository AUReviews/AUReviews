/**
 * Term codes and the offering time axis (v1-spec §3/§9; issue #23).
 *
 * A Term is a semester + calendar year — the grain Offerings are recorded at.
 * Banner 8 addresses terms with a six-digit `YYYYT0` code whose 4-digit prefix
 * is the *academic year's spring* calendar year and whose 5th digit is the
 * semester (`10`=Fall, `20`=Spring, `30`=Summer) — so Fall 2026 is `202710`
 * while Spring 2026 is `202620`. Validated against the live
 * `bwckschd.p_disp_dyn_sched` dropdown before hardcoding, per §9; the dropdown
 * bottoms out at `200810` (Fall 2007), the ingest floor.
 *
 * "Typically offered" is a display-time rollup over these codes — never a
 * stored flag (§6).
 */

export type Semester = "Fall" | "Spring" | "Summer";

/** A parsed Banner term: the verbatim code plus its human semester/year. */
export interface Term {
  code: string;
  semester: Semester;
  /** Calendar year the semester actually runs in (Fall 2026 for `202710`). */
  year: number;
}

/** The earliest term Banner exposes — the ingest history floor (§9). */
export const FALL_2007_TERM_CODE = "200810";

const TERM_CODE_RE = /^(\d{4})(10|20|30)$/;

const SEMESTER_BY_DIGITS: Record<string, Semester> = {
  "10": "Fall",
  "20": "Spring",
  "30": "Summer",
};

/** Canonical academic-year display order for semester rollups. */
const SEMESTER_ORDER: Semester[] = ["Fall", "Spring", "Summer"];

/** Parse a `YYYYT0` Banner code into a {@link Term}, or null if malformed. */
export function parseTermCode(code: string): Term | null {
  const match = TERM_CODE_RE.exec(code);
  if (!match) return null;
  const prefix = Number(match[1]);
  const semester = SEMESTER_BY_DIGITS[match[2]];
  // Fall belongs to the academic year whose spring is the prefix, so it runs
  // the calendar year before it; Spring and Summer run in the prefix year.
  const year = semester === "Fall" ? prefix - 1 : prefix;
  return { code, semester, year };
}

/** Human label for a term: `Fall 2007`. */
export function formatTerm(term: Term): string {
  return `${term.semester} ${term.year}`;
}

/**
 * The inverse of {@link parseTermCode}: the Banner `YYYYT0` code for a semester
 * and its calendar year. Fall belongs to the following academic year, so its
 * prefix is `year + 1` (Fall 2026 → `202710`); Spring/Summer keep the calendar
 * year (Spring 2026 → `202620`, Summer 2026 → `202630`). Round-trips with
 * `parseTermCode` for every valid term.
 */
export function termToCode(semester: Semester, year: number): string {
  const digits = semester === "Fall" ? "10" : semester === "Spring" ? "20" : "30";
  const prefix = semester === "Fall" ? year + 1 : year;
  return `${prefix}${digits}`;
}

// Ascending order within a calendar year, so a term ordinal (`year * 3 + rank`)
// increases monotonically with real time — the basis for walking the recent
// window back from "now" (§4).
const SEMESTER_RANK: Record<Semester, number> = {
  Spring: 0,
  Summer: 1,
  Fall: 2,
};

const RANK_TO_SEMESTER: Semester[] = ["Spring", "Summer", "Fall"];

/**
 * The term in progress on a given date — the anchor the rolling submission
 * window counts back from (§4). Auburn's calendar maps roughly to Jan–Apr =
 * Spring, May–Jul = Summer, Aug–Dec = Fall; this is the coarse month split, not
 * exact session boundaries, which is all the term dropdown needs.
 */
export function currentTerm(date: Date): Term {
  const month = date.getMonth(); // 0 = January
  const year = date.getFullYear();
  const semester: Semester =
    month <= 3 ? "Spring" : month <= 6 ? "Summer" : "Fall";
  return { code: termToCode(semester, year), semester, year };
}

/**
 * The most recent `count` terms up to and including the one in progress on
 * `date`, newest first (§4's rolling window is just a count of these). Uses a
 * monotonic term ordinal so the walk-back crosses year boundaries correctly:
 * from Spring the previous term is the prior Fall, and so on.
 */
export function recentTerms(date: Date, count: number): Term[] {
  const anchor = currentTerm(date);
  const anchorOrdinal = anchor.year * 3 + SEMESTER_RANK[anchor.semester];
  const terms: Term[] = [];
  for (let i = 0; i < count; i++) {
    const ordinal = anchorOrdinal - i;
    const year = Math.floor(ordinal / 3);
    const semester = RANK_TO_SEMESTER[ordinal % 3];
    terms.push({ code: termToCode(semester, year), semester, year });
  }
  return terms;
}

/**
 * Whether a code names a term the offering ingest should cover: well-formed
 * and Fall 2007 or later. Codes are fixed-width numerics, so string comparison
 * orders them chronologically.
 */
export function isIngestibleTermCode(code: string): boolean {
  return parseTermCode(code) !== null && code >= FALL_2007_TERM_CODE;
}

/**
 * The "Typically offered" rollup (§6): the distinct semesters present in a
 * course's Offering history, in canonical Fall/Spring/Summer order. Purely
 * display-time — computed from Offering terms on every render, never stored —
 * so refinements (e.g. weighting recent years) need no migration. Unparseable
 * codes are skipped rather than poisoning the badge.
 */
export function rollupOfferedSemesters(termCodes: string[]): Semester[] {
  const seen = new Set<Semester>();
  for (const code of termCodes) {
    const term = parseTermCode(code);
    if (term) seen.add(term.semester);
  }
  return SEMESTER_ORDER.filter((s) => seen.has(s));
}
