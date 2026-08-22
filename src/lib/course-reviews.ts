/**
 * Course-page review presentation logic (v1-spec §5; issue #25) — pure,
 * framework- and DB-free, following the same split as `browse.ts`: the `db`
 * layer supplies rows, the course page renders them, and every ordering and
 * formatting decision lives here where it is unit-testable.
 *
 * Two §5 rules are centralized in this module:
 *  - the review list's sort options (helpful — the Wilson ranking that sinks
 *    low-quality reviews — plus newest and term; no recency decay anywhere);
 *  - the low-data gate applied to each per-instructor row via
 *    `gateAverages` (the same gate the course headline and browse rows use).
 */
import {
  type InstructorUnknown,
  formatTerm,
  gateAverages,
  parseTermCode,
  wilsonLowerBound,
} from "@/domain";

/** One published review as the course page renders it: the required core, the
 * optional pills, the resolved instructor display name (null when the review
 * recorded an explicit unknown), and its live helpful tallies. */
export interface CourseReview {
  id: string;
  instructorId: string | null;
  instructorName: string | null;
  instructorUnknown: InstructorUnknown | null;
  termCode: string;
  overall: number;
  difficulty: number;
  workloadHours: number;
  body: string;
  workloadShape: string[];
  grade: string | null;
  languages: string[];
  languagesOther: string | null;
  curved: string | null;
  attendance: string | null;
  prep: string | null;
  createdAt: Date;
  helpfulUp: number;
  helpfulDown: number;
}

/** The instructor line on a review card. The two §4 escape hatches render as
 * explicit statements, never as a blank ("Professor" per the site's UI copy). */
export function instructorLabel(
  review: Pick<CourseReview, "instructorName" | "instructorUnknown">,
): string {
  if (review.instructorName) return review.instructorName;
  return review.instructorUnknown === "dont-remember"
    ? "Professor not remembered"
    : "Professor not listed";
}

/** A review's term as its human label (`Spring 2026`); the raw code if somehow
 * unparseable — shown rather than dropped, since data is never hidden (§5). */
export function formatReviewTerm(termCode: string): string {
  const term = parseTermCode(termCode);
  return term ? formatTerm(term) : termCode;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Posted-date stamp: `Aug 2026`. Month granularity — precise enough to date a
 * review, coarse enough not to fingerprint its author. UTC so the server and
 * any client re-render agree. */
export function formatReviewDate(date: Date): string {
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/**
 * The optional "Course details" (§4) flattened into display pills, in the
 * field order the form asks them. Self-explanatory values ride bare; values
 * that would be ambiguous out of context (a bare "A", "Mandatory", "Somewhat")
 * carry their field as a prefix. A chosen "Other" language is replaced by the
 * free-text entry when one was given.
 */
export function reviewPills(review: CourseReview): string[] {
  const pills: string[] = [...review.workloadShape];
  if (review.grade) pills.push(`Grade: ${review.grade}`);
  for (const language of review.languages) {
    pills.push(
      language === "Other" && review.languagesOther
        ? review.languagesOther
        : language,
    );
  }
  if (review.curved) pills.push(review.curved);
  if (review.attendance) pills.push(`Attendance: ${review.attendance}`);
  if (review.prep) pills.push(`Prep: ${review.prep}`);
  return pills;
}

/** The review list's sort options (§5): helpful (default, Wilson-ranked),
 * newest, and term — the term is always shown and is a sort option. */
export type ReviewSortKey = "helpful" | "newest" | "term";

/**
 * Sort a copy of the review list. Every key reads "best/most recent first":
 * `helpful` by Wilson lower bound (ties → newest), `newest` by post date,
 * `term` by the term reviewed (ties → newest). The final tiebreak is the id,
 * so the order is total and never reshuffles between renders. Pure — the
 * input array is never mutated.
 */
export function sortCourseReviews(
  reviews: readonly CourseReview[],
  key: ReviewSortKey,
): CourseReview[] {
  const byNewest = (a: CourseReview, b: CourseReview) =>
    b.createdAt.getTime() - a.createdAt.getTime();

  const primary = (a: CourseReview, b: CourseReview): number => {
    switch (key) {
      case "helpful":
        return (
          wilsonLowerBound(b.helpfulUp, b.helpfulDown) -
          wilsonLowerBound(a.helpfulUp, a.helpfulDown)
        );
      case "newest":
        return 0; // byNewest below is the primary order
      case "term":
        // Banner codes are fixed-width numerics — string compare is
        // chronological (see domain/term.ts).
        return b.termCode.localeCompare(a.termCode);
    }
  };

  return [...reviews].sort(
    (a, b) => primary(a, b) || byNewest(a, b) || a.id.localeCompare(b.id),
  );
}

/** Raw per-instructor SQL aggregates over a course's published reviews. */
export interface InstructorStats {
  id: string;
  displayName: string;
  overall: number | null;
  difficulty: number | null;
  workload: number | null;
  reviewCount: number;
}

/** One per-instructor row: averages already gated (§5's low-data rule), count
 * always the true N. Feeds the Reviews tab's professor filter tabs (the "By
 * professor" ratings table itself was cut by maintainer decision). */
export interface InstructorRow {
  id: string;
  displayName: string;
  overall: number | null;
  difficulty: number | null;
  workload: number | null;
  reviewCount: number;
}

/**
 * Build the per-instructor rows (§5): one row per instructor who taught the
 * course (from the Banner offering links), merged with the review aggregates,
 * in **neutral order — alphabetical, not ranked**. Instructors who taught but
 * have no reviews get an honest zero row; an instructor with reviews whose
 * offering link a later re-import dropped is kept (reviews are never hidden).
 * Averages are gated per row by the domain's low-data threshold.
 */
export function buildInstructorRows(
  taught: readonly { id: string; displayName: string }[],
  stats: readonly InstructorStats[],
): InstructorRow[] {
  const statsById = new Map(stats.map((s) => [s.id, s]));
  const rows = new Map<string, InstructorRow>();

  for (const instructor of taught) {
    const s = statsById.get(instructor.id);
    rows.set(instructor.id, toRow(instructor.id, instructor.displayName, s));
  }
  for (const s of stats) {
    if (!rows.has(s.id)) rows.set(s.id, toRow(s.id, s.displayName, s));
  }

  return [...rows.values()].sort(byName);
}

function toRow(
  id: string,
  displayName: string,
  s: InstructorStats | undefined,
): InstructorRow {
  const count = s?.reviewCount ?? 0;
  return {
    id,
    displayName,
    ...gateAverages(
      {
        overall: s?.overall ?? null,
        difficulty: s?.difficulty ?? null,
        workload: s?.workload ?? null,
      },
      count,
    ),
    reviewCount: count,
  };
}

function byName(a: InstructorRow, b: InstructorRow): number {
  return a.displayName.localeCompare(b.displayName, undefined, {
    sensitivity: "base",
  });
}
