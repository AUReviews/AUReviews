/**
 * Aggregate and ranking math (v1-spec §5; issue #25) — pure, framework- and
 * SQL-free. The aggregates themselves (plain arithmetic means over published
 * reviews) are computed in SQL at revalidation time; this module holds the two
 * rules layered on top of those raw numbers, so both are unit-testable and
 * applied identically everywhere they appear:
 *
 *   1. the **low-data gate** — a computed average requires N ≥
 *      {@link MIN_REVIEWS_FOR_AVERAGE} (course headline, browse row, each
 *      per-instructor row); and
 *   2. the **Wilson lower bound** the helpful-vote ranking sorts by (§4's
 *      anti-junk model: voting sinks low-quality reviews rather than blocking
 *      them).
 */

/**
 * How many reviews a course (or per-instructor row) needs before its computed
 * average is reportable. §5 specifies N ≥ 2, but the maintainer relaxed it to
 * 1 for launch (2026-08): with a young review pool, hiding a course's only
 * review's numbers behind "—" buried real signal. Restore §5's rule by setting
 * this back to 2 — every gate reads it from here.
 */
export const MIN_REVIEWS_FOR_AVERAGE = 1;

/**
 * Apply the low-data rule to a raw SQL average: the average is only reportable
 * at N ≥ {@link MIN_REVIEWS_FOR_AVERAGE}. Below that — or when SQL had no rows
 * to average — the caller gets `null`, which every surface renders as "—" with
 * the true count still visible. Data is never hidden; only the computed
 * average waits.
 */
export function gateAverage(
  average: number | null,
  reviewCount: number,
): number | null {
  if (average === null || reviewCount < MIN_REVIEWS_FOR_AVERAGE) return null;
  return average;
}

/** The three §5 metrics as one raw-averages bundle — always reported together
 * (no composite is ever computed from them). */
export interface RatingAverages {
  overall: number | null;
  difficulty: number | null;
  workload: number | null;
}

/** {@link gateAverage} across the metric triple at once — the shape every
 * aggregate consumer (course headline, browse row, by-instructor row) gates. */
export function gateAverages(
  averages: RatingAverages,
  reviewCount: number,
): RatingAverages {
  return {
    overall: gateAverage(averages.overall, reviewCount),
    difficulty: gateAverage(averages.difficulty, reviewCount),
    workload: gateAverage(averages.workload, reviewCount),
  };
}

// 95% two-sided confidence — the conventional z for Wilson ranking.
const WILSON_Z = 1.96;

/**
 * The lower bound of the Wilson score interval on the up-vote proportion
 * (§4/§5). Ranking by this instead of the raw proportion or net score means a
 * review needs *evidence*, not just a good ratio: 1 up / 0 down ranks below
 * 100 up / 5 down, and heavily downvoted reviews sink. Zero votes → 0, so
 * unvoted reviews sit together beneath anything positively attested.
 */
export function wilsonLowerBound(up: number, down: number): number {
  const n = up + down;
  if (n === 0) return 0;
  const z = WILSON_Z;
  const p = up / n;
  const z2 = z * z;
  return (
    (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) /
    (1 + z2 / n)
  );
}
