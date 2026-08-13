/**
 * Browse/index presentation logic (v1-spec §5; issue #20) — pure, framework- and
 * DB-free, so the click-to-sort semantics and the low-data display rule are
 * unit-testable in isolation. The `db` layer supplies {@link BrowseCourse} rows
 * and the `courses` route renders them; both defer every ordering and formatting
 * decision to this module.
 *
 * The table is deliberately **never a leaderboard** (§5): the default order is
 * catalog order (COMP number ascending), which reads identically whether the
 * catalog is empty of reviews or full, and no column defaults to a "worst/
 * hardest" framing. Every column is click-to-sort, ascending or descending.
 */

export type CourseStatus = "active" | "retired";

/** One row of the browse table. The three averages are `null` until a course
 * clears the low-data gate (`gateAverage` in domain/aggregate.ts — the db
 * layer nulls them before they get here); `reviewCount` is always the true
 * N. */
export interface BrowseCourse {
  id: string;
  subject: string;
  number: string;
  title: string;
  status: CourseStatus;
  overall: number | null;
  difficulty: number | null;
  workload: number | null;
  reviewCount: number;
}

/** The six sortable columns, keyed by what they sort on (not their header text:
 * "Course" sorts on `title`, "Code" on `code`, "Reviews" on `reviews`). */
export type SortKey =
  | "code"
  | "title"
  | "overall"
  | "difficulty"
  | "workload"
  | "reviews";

export type SortDirection = "asc" | "desc";

export interface SortState {
  key: SortKey;
  direction: SortDirection;
}

/** Catalog order — the stable, non-ranking default (§5). */
export const DEFAULT_SORT: SortState = { key: "code", direction: "asc" };

/** The minimal shape catalog order sorts on — any course-like row with a
 * `(subject, number)` code. */
export interface CatalogOrdered {
  subject: string;
  number: string;
}

/** Compare two courses by catalog identity: subject, then COMP number ordered
 * NUMERICALLY (so 60 < 500 < 1000), then the raw number as a final tiebreak.
 * This is both the browse `code` column's ordering and the stability tiebreak
 * every other column falls back on — and the single definition of "catalog
 * order" (§5) reused wherever the site lists courses (e.g. `prereqs.ts`'s
 * Unlocks). Always ascending — callers apply direction. */
export function compareCatalogOrder(a: CatalogOrdered, b: CatalogOrdered): number {
  const bySubject = a.subject.localeCompare(b.subject);
  if (bySubject !== 0) return bySubject;

  const na = Number.parseInt(a.number, 10);
  const nb = Number.parseInt(b.number, 10);
  const aNum = Number.isNaN(na);
  const bNum = Number.isNaN(nb);
  if (!aNum && !bNum && na !== nb) return na - nb;
  // One or both numbers aren't parseable — fall back to a string compare so the
  // order is still total and deterministic.
  return a.number.localeCompare(b.number, undefined, { numeric: true });
}

/** Read the nullable numeric field a rating column sorts on. */
function ratingValue(course: BrowseCourse, key: SortKey): number | null {
  switch (key) {
    case "overall":
      return course.overall;
    case "difficulty":
      return course.difficulty;
    case "workload":
      return course.workload;
    default:
      return null;
  }
}

/**
 * Sort a copy of `courses` by the given column and direction. Pure — the input
 * array is never mutated.
 *
 * Two rules make the table read predictably:
 * - **Missing averages sink.** A `null` rating (no computable average yet) is
 *   always ordered last, in BOTH directions — flipping the sort never floats
 *   "—" rows to the top.
 * - **Ties fall back to catalog order.** Equal sort values (e.g. every course
 *   showing "—") keep catalog order regardless of direction, so the table is
 *   stable and never reshuffles arbitrarily.
 */
export function sortBrowseCourses(
  courses: readonly BrowseCourse[],
  key: SortKey,
  direction: SortDirection,
): BrowseCourse[] {
  const sign = direction === "asc" ? 1 : -1;

  const primary = (a: BrowseCourse, b: BrowseCourse): number => {
    switch (key) {
      case "code":
        return sign * compareCatalogOrder(a, b);
      case "title":
        return sign * a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
      case "reviews":
        return sign * (a.reviewCount - b.reviewCount);
      case "overall":
      case "difficulty":
      case "workload": {
        const va = ratingValue(a, key);
        const vb = ratingValue(b, key);
        // Nulls are always last, independent of direction.
        if (va === null && vb === null) return 0; // tie → catalog fallback below
        if (va === null) return 1;
        if (vb === null) return -1;
        return sign * (va - vb);
      }
    }
  };

  return [...courses].sort((a, b) => {
    const byPrimary = primary(a, b);
    if (byPrimary !== 0) return byPrimary;
    // Stable, direction-independent tiebreak so equal rows keep catalog order.
    return compareCatalogOrder(a, b);
  });
}

/**
 * Render a metric average (§5): two decimals, or "—" when there is no
 * computed average. A `null` here means the low-data gate already withheld it
 * (`gateAverage` — the single place the threshold lives); this function only
 * formats.
 */
export function formatAverage(value: number | null): string {
  if (value === null) return "—";
  return value.toFixed(2);
}

/** Render the true review count — shown even when it's 0, since data is never
 * hidden; only the computed average waits for the low-data gate (§5). */
export function formatReviewCount(reviewCount: number): string {
  return String(reviewCount);
}
