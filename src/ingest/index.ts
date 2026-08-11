/**
 * Ingest barrel (v1-spec §8, ADR 0002; issues #18/#23).
 *
 * The COMP imports: scrape the Auburn bulletin (catalog attributes) and Banner
 * (term offerings + instructors-of-record), resolve rows against the domain
 * planners, and write catalog-side state idempotently. This module imports the
 * domain layer and NEVER the reverse — the catalog/review seam is one-way.
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
export {
  type TermOption,
  parseBannerSchedule,
  parseTermOptions,
} from "./banner";
export {
  type OfferingsIngestDeps,
  type OfferingsIngestSummary,
  runOfferingsIngest,
} from "./import-offerings";
export {
  BANNER_SCHEDULE_URL,
  BANNER_TERM_LIST_URL,
  fetchBannerTermListHtml,
  fetchBannerTermScheduleHtml,
  fetchBulletinHtml,
} from "./fetch";
