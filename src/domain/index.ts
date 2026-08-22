/**
 * Domain layer barrel — the pure core of AUReviews.
 *
 * Everything re-exported here is framework- and persistence-agnostic. The
 * `ingest/` module and the `db`/`app` layers import FROM here; this layer never
 * imports THEM (the one-way seam of ADR 0002, enforced by eslint
 * `import/no-restricted-paths` and by src/domain/boundary.test.ts).
 */
export {
  type RatingAverages,
  gateAverage,
  gateAverages,
  wilsonLowerBound,
} from "./aggregate";
export {
  type CourseId,
  type InstructorId,
  isUuid,
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
  currentTerm,
  formatTerm,
  isIngestibleTermCode,
  parseTermCode,
  recentTerms,
  rollupOfferedSemesters,
  termToCode,
} from "./term";
export {
  type DoorBlock,
  type DoorBlockCode,
  type InstructorChoice,
  type InstructorUnknown,
  type ReviewCoreInput,
  type ReviewFieldError,
  type SelectableTerm,
  type TermWindowMode,
  type VoteDirection,
  ATTENDANCE_OPTIONS,
  BODY_MIN_LENGTH,
  CURVED_OPTIONS,
  DEFAULT_TERM_WINDOW,
  GRADE_OPTIONS,
  INSTRUCTOR_UNKNOWN_VALUES,
  LANGUAGE_OPTIONS,
  PREP_OPTIONS,
  TERM_WINDOW_COUNTS,
  WORKLOAD_SHAPE_OPTIONS,
  canSubmitReview,
  checkReviewBody,
  parseInstructorChoice,
  sanitizeMultiSelect,
  sanitizeSingleSelect,
  selectableTerms,
  validateReviewCore,
} from "./review";
export {
  type CreateInstructorAction,
  type ExistingInstructor,
  type ExistingOffering,
  type IncomingInstructor,
  type IncomingOffering,
  type IncomingSection,
  type InstructorPendingReason,
  type InstructorSighting,
  type OfferingKey,
  type OfferingLink,
  type OfferingsPlan,
  type OfferingsSnapshot,
  type PendingInstructorAction,
  type PlanOfferingsOptions,
  type RenameInstructorAction,
  collapseSections,
  instructorDedupeKey,
  offeringKey,
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
export {
  type ReportReason,
  type ReviewReportResult,
  REPORT_DETAILS_MAX_LENGTH,
  REPORT_REASONS,
  validateReviewReport,
} from "./moderation";
