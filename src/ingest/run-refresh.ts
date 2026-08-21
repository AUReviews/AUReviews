/**
 * Scheduled catalog refresh entrypoint (issue #30).
 *
 * What the `catalog-refresh` GitHub Action runs — weekly and on
 * `workflow_dispatch`. The scrape takes minutes, so it lives in an Action, not
 * a Vercel function/cron (Hobby caps those at ~60s / once daily; §8). It runs
 * the two in-repo imports in order (catalog → offerings) over the POOLED
 * Neon endpoint (DATABASE_URL), then pings the app's `/api/revalidate` so the
 * pages behind the `catalog` tag refresh. Idempotent; ambiguous matches land
 * as pending rows (ADR 0002) and are flagged in the run summary.
 *
 *   npm run refresh
 *
 * Env: DATABASE_URL (pooled), AUREVIEWS_BASE_URL, REVALIDATE_SECRET, and
 * optionally AUBURN_CATALOG_YEAR. Set SKIP_REVALIDATE=1 to run the imports
 * without pinging a deployment (local dry runs).
 */
import { applyCatalogPlan, loadCatalogSnapshot } from "@/db/catalog";
import { applyOfferingsPlan, loadOfferingsSnapshot } from "@/db/offerings";
import {
  fetchBannerTermListHtml,
  fetchBannerTermScheduleHtml,
  fetchBulletinHtml,
} from "./fetch";
import { resolveCatalogYear, runIngest } from "./import";
import { runOfferingsIngest } from "./import-offerings";
import {
  formatRefreshAnnotations,
  pingRevalidate,
  type RefreshSummary,
  runCatalogRefresh,
} from "./refresh";

// Load .env.local for local runs (Node 24 built-in). On CI the file is absent
// and the vars are injected directly, so a missing file is fine.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local — rely on the ambient environment.
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

/** Log both import summaries plus the GitHub annotations for pending rows. */
function report(catalogYear: string, summary: RefreshSummary): void {
  const { catalog, offerings } = summary;
  console.log(
    `Catalog ingest (catalog year ${catalogYear}): parsed ${catalog.parsed}, ` +
      `created ${catalog.created}, updated ${catalog.updated}, ` +
      `pending ${catalog.pending}, retired ${catalog.retired}.`,
  );
  console.log(
    `Offerings ingest: ${offerings.terms} terms, ` +
      `${offerings.offeringsSeen} offerings seen, ` +
      `${offerings.offeringsCreated} created; instructors ` +
      `${offerings.instructorsCreated} created, ` +
      `${offerings.instructorsRenamed} renamed; links ` +
      `+${offerings.linksAdded}/-${offerings.linksRemoved}; ` +
      `pending ${offerings.pending}.`,
  );

  // GitHub workflow commands — harmless plain lines outside Actions.
  for (const line of formatRefreshAnnotations(summary)) console.log(line);
}

async function main(): Promise<void> {
  const catalogYear = resolveCatalogYear();
  const skipRevalidate = process.env.SKIP_REVALIDATE === "1";

  // Fail fast on missing revalidation config before spending minutes scraping.
  const target = skipRevalidate
    ? null
    : {
        baseUrl: requireEnv("AUREVIEWS_BASE_URL"),
        secret: requireEnv("REVALIDATE_SECRET"),
      };

  await runCatalogRefresh({
    runCatalog: () =>
      runIngest({
        fetchHtml: () => fetchBulletinHtml(),
        loadSnapshot: loadCatalogSnapshot,
        applyPlan: applyCatalogPlan,
        catalogYear,
      }),
    runOfferings: () =>
      runOfferingsIngest({
        fetchTermListHtml: fetchBannerTermListHtml,
        fetchTermScheduleHtml: fetchBannerTermScheduleHtml,
        loadSnapshot: loadOfferingsSnapshot,
        applyPlan: applyOfferingsPlan,
      }),
    report: (summary) => report(catalogYear, summary),
    revalidate: async () => {
      if (!target) {
        console.log("SKIP_REVALIDATE=1 — not pinging /api/revalidate.");
        return;
      }
      await pingRevalidate(target);
      console.log(`Revalidated "catalog" at ${target.baseUrl}.`);
    },
  });
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
