/**
 * Domain layer barrel — the pure core of AUReviews.
 *
 * Everything re-exported here is framework- and persistence-agnostic. The
 * `ingest/` module and the `db`/`app` layers import FROM here; this layer never
 * imports THEM (the one-way seam of ADR 0002, enforced by eslint
 * `import/no-restricted-paths` and by src/domain/boundary.test.ts).
 */
export { type CourseId, mintCourseId, normalizeCatalogKey } from "./identity";
export { type PlaceholderRow, formatPlaceholder } from "./placeholder";
