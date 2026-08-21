/**
 * Scheduled catalog refresh (issue #30, v1-spec §8/§12) — the pure core.
 *
 * One "refresh" is the two existing imports run back to back — catalog (#18)
 * first so the crosswalk exists, then offerings (#23) which maps onto it — and,
 * only if both succeed, a ping to the app's `/api/revalidate` so the pages
 * cached behind the `catalog` tag recompute. Every edge is injected: the
 * GitHub Action entrypoint (`run-refresh.ts`) wires the real ones, tests drive
 * fakes. Both imports are idempotent and write ambiguous matches as pending
 * rows (ADR 0002); this module never applies anything itself, it only
 * sequences and reports.
 */
import type { IngestSummary } from "./import";
import type { OfferingsIngestSummary } from "./import-offerings";

/** Injected edges — real ones in run-refresh.ts, fakes in tests. */
export interface RefreshDeps {
  /** Run the COMP bulletin import and report what it did. */
  runCatalog: () => Promise<IngestSummary>;
  /** Run the Banner offerings import and report what it did. */
  runOfferings: () => Promise<OfferingsIngestSummary>;
  /** Refresh cached pages. Only called after both imports succeed. */
  revalidate: () => Promise<void>;
}

/** What one refresh did, for the run log and the GitHub annotations. */
export interface RefreshSummary {
  catalog: IngestSummary;
  offerings: OfferingsIngestSummary;
}

/**
 * Run both imports in dependency order, then revalidate. A failure in either
 * import propagates and skips the revalidation — stale-but-consistent pages
 * beat pages recomputed over a half-applied import.
 */
export async function runCatalogRefresh(
  deps: RefreshDeps,
): Promise<RefreshSummary> {
  const catalog = await deps.runCatalog();
  const offerings = await deps.runOfferings();
  await deps.revalidate();
  return { catalog, offerings };
}

/**
 * GitHub Actions workflow-command lines for the run summary (§12: pending rows
 * must surface, never hide). `::warning::` when the run wrote pending
 * crosswalk or instructor-merge rows an admin must decide on; `::notice::`
 * for Banner codes the crosswalk couldn't map. Empty when there is nothing to
 * flag. One line each — workflow commands are line-delimited.
 */
export function formatRefreshAnnotations(summary: RefreshSummary): string[] {
  const lines: string[] = [];

  if (summary.catalog.pending > 0) {
    lines.push(
      `::warning title=Pending crosswalk rows::${summary.catalog.pending} ` +
        `pending crosswalk row(s) written (crosswalk_pending) — ambiguous ` +
        `catalog matches await an admin decision; none were auto-applied.`,
    );
  }

  if (summary.offerings.pending > 0) {
    lines.push(
      `::warning title=Pending instructor merges::${summary.offerings.pending} ` +
        `pending instructor merge(s) written (instructor_pending) — ambiguous ` +
        `instructor matches await an admin decision; none were auto-merged.`,
    );
  }

  if (summary.offerings.unmatchedCatalogKeys.length > 0) {
    lines.push(
      `::notice title=Unmatched Banner courses::` +
        `${summary.offerings.unmatchedCatalogKeys.length} Banner course(s) ` +
        `have no crosswalk mapping and were skipped: ` +
        summary.offerings.unmatchedCatalogKeys.join(", "),
    );
  }

  return lines;
}

/** Where the deployed app lives and the shared secret its endpoint expects. */
export interface RevalidateTarget {
  /** Deployment origin, e.g. `https://aureviews.vercel.app` (trailing slash ok). */
  baseUrl: string;
  /** Must equal the app's `REVALIDATE_SECRET`. */
  secret: string;
}

/** The cache tag the catalog/browse/home pages sit behind (see src/app). */
export const CATALOG_CACHE_TAG = "catalog";

/**
 * POST `{ tag: "catalog" }` to the app's `/api/revalidate` with the bearer
 * secret. Any non-2xx throws so the Action fails visibly rather than leaving
 * pages stale for up to an hour with a green check.
 */
export async function pingRevalidate(
  target: RevalidateTarget,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const url = new URL("/api/revalidate", target.baseUrl).toString();
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${target.secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ tag: CATALOG_CACHE_TAG }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Revalidation failed: ${response.status} ${response.statusText} ${text}`.trim(),
    );
  }
}
