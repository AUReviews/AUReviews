/**
 * Catalog ingest entrypoint (issue #18).
 *
 * Wires the real edges — a live bulletin fetch and the Neon-backed catalog layer
 * — into the pure orchestrator, then runs one COMP import and logs a summary.
 * Safe to re-run: the import is idempotent and only ever touches catalog-side
 * Course/crosswalk state, never a Review (ADR 0002).
 *
 *   npm run ingest
 *
 * Connects over the POOLED endpoint (DATABASE_URL) like the app. Run the
 * migrations first (`npm run db:migrate`) so the catalog tables exist.
 */
import { applyCatalogPlan, loadCatalogSnapshot } from "@/db/catalog";
import { fetchBulletinHtml } from "./fetch";
import { resolveCatalogYear, runIngest } from "./import";

// Load .env.local for local runs (Node 24 built-in). On CI/Vercel the file is
// absent and the vars are injected directly, so a missing file is fine.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local — rely on the ambient environment.
}

async function main(): Promise<void> {
  // Override per-year via AUBURN_CATALOG_YEAR without a code change (§9).
  const catalogYear = resolveCatalogYear();

  const summary = await runIngest({
    fetchHtml: () => fetchBulletinHtml(),
    loadSnapshot: loadCatalogSnapshot,
    applyPlan: applyCatalogPlan,
    catalogYear,
  });

  console.log(
    `Ingest complete (catalog year ${catalogYear}): ` +
      `parsed ${summary.parsed}, created ${summary.created}, ` +
      `updated ${summary.updated}, pending ${summary.pending}, ` +
      `retired ${summary.retired}.`,
  );

  if (summary.pending > 0) {
    console.log(
      `${summary.pending} ambiguous crosswalk row(s) await an admin decision ` +
        `(crosswalk_pending) — none were auto-applied.`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
