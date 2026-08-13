/**
 * Aggregate and ranking math (v1-spec §5; issue #25) — pure, framework- and
 * SQL-free. The aggregates themselves (plain arithmetic means over published
 * reviews) are computed in SQL at revalidation time; this module holds the two
 * rules layered on top of those raw numbers, so both are unit-testable and
 * applied identically everywhere they appear:
 *
 *   1. the **low-data gate** — a computed average requires N ≥ 2 (course
 *      headline, browse row, each by-instructor row); and
 *   2. the **Wilson lower bound** the helpful-vote ranking sorts by (§4's
 *      anti-junk model: voting sinks low-quality reviews rather than blocking
 *      them).
 */

/**
 * Apply §5's low-data rule to a raw SQL average: the average is only reportable
 * once a course (or by-instructor row) has N ≥ 2 reviews. Below that — or when
 * SQL had no rows to average — the caller gets `null`, which every surface
 * renders as "—" with the true count still visible. Data is never hidden; only
 * the computed average waits.
 */
export function gateAverage(
  average: number | null,
  reviewCount: number,
): number | null {
  if (average === null || reviewCount < 2) return null;
  return average;
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
