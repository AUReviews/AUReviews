/**
 * Ingest barrel (v1-spec §8, ADR 0002; issue #18).
 *
 * The COMP catalog import: scrape the Auburn bulletin, resolve rows against the
 * crosswalk, and write catalog-side attributes idempotently. This module imports
 * the domain layer and NEVER the reverse — the catalog/review seam is one-way.
 */
export {
  type RawCatalogRow,
  parseCatalogHtml,
  parseCreditHours,
} from "./catalog";
export {
  COMP_CATALOG_URL,
  type IngestDeps,
  type IngestSummary,
  runIngest,
} from "./import";
export { fetchBulletinHtml } from "./fetch";
