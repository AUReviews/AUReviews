/**
 * Domain layer barrel — the pure core of AUReviews.
 *
 * Everything re-exported here is framework- and persistence-agnostic. The
 * `ingest/` module and the `db`/`app` layers import FROM here; this layer never
 * imports THEM (the one-way seam of ADR 0002, enforced by eslint
 * `import/no-restricted-paths` and by src/domain/boundary.test.ts).
 */
export {
  type CourseId,
  type InstructorId,
  mintCourseId,
  mintInstructorId,
  normalizeCatalogKey,
  normalizeInstructorName,
  normalizeTitle,
} from "./identity";
export {
  type ApplyCourseAction,
  type CatalogSnapshot,
  type CourseAttributes,
  type CourseStatus,
  type CreateCourseAction,
  type CrosswalkMapping,
  type ExistingCourse,
  type IncomingCourse,
  type IngestPlan,
  type PendingCrosswalkAction,
  type PendingReason,
  type PlanIngestOptions,
  planIngest,
} from "./crosswalk";
export {
  type Semester,
  type Term,
  FALL_2007_TERM_CODE,
  formatTerm,
  isIngestibleTermCode,
  parseTermCode,
  rollupOfferedSemesters,
} from "./term";
export {
  type CreateInstructorAction,
  type ExistingInstructor,
  type ExistingOffering,
  type IncomingInstructor,
  type IncomingOffering,
  type IncomingSection,
  type InstructorPendingReason,
  type OfferingKey,
  type OfferingLink,
  type OfferingsPlan,
  type OfferingsSnapshot,
  type PendingInstructorAction,
  type PlanOfferingsOptions,
  type RenameInstructorAction,
  collapseSections,
  planOfferings,
} from "./offerings";
export {
  type ParsedPrereqs,
  type PrereqCourseRef,
  type PrereqGroup,
  type PrereqRelation,
  type PrereqRequirement,
  parsePrereqs,
  prereqCodeKey,
  prerequisiteEdges,
} from "./prereq";
export { type PlaceholderRow, formatPlaceholder } from "./placeholder";
export {
  type IdentityHash,
  computeIdentityHash,
  isAuburnStudentEmail,
  normalizeEmail,
} from "./anonymity";
