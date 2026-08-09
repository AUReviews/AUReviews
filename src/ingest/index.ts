/**
 * Ingest seam (v1-spec §8, ADR 0002).
 *
 * This module imports the domain layer and NEVER the reverse — the catalog/
 * review seam is one-way. It exists from the skeleton onward so the repo shape
 * and that direction are established before the real work lands. The Auburn
 * bulletin scrape and the idempotent import contract are #18; this is a stub
 * that already leans on the domain's durable-identity primitives so the seam is
 * load-bearing, not decorative.
 */
import { mintCourseId, normalizeCatalogKey, type CourseId } from "@/domain";

/** A raw catalog row as it will come off the bulletin scrape (#18). */
export interface RawCatalogRow {
  subject: string;
  number: string;
  title: string;
}

/** A raw row resolved to a durable Course identity via the domain layer. */
export interface MintedCourse {
  id: CourseId;
  catalogKey: string;
  title: string;
}

/**
 * Turn a raw scraped row into a durable Course identity. Placeholder for the
 * real crosswalk-aware import in #18; here it just demonstrates that ingest
 * depends on the domain (mint id + normalize key), never the other way around.
 */
export function mintCourseFromRaw(row: RawCatalogRow): MintedCourse {
  return {
    id: mintCourseId(),
    catalogKey: normalizeCatalogKey(row),
    title: row.title.trim(),
  };
}
