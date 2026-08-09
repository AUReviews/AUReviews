/**
 * Crosswalk resolution — the precious, review-side decision logic (§3, ADR 0002).
 *
 * Given the current catalog scrape and a snapshot of what we already know, decide
 * for each incoming row whether to **apply** it to an existing durable Course,
 * **create** a brand-new one, or surface it as a **pending** admin decision — and
 * which existing Courses have dropped out and must be **retired** (never deleted).
 *
 * This module is pure: no framework, no persistence, no clock, no randomness
 * (ids come from an injected minter). All the interesting import-contract
 * invariants live here so they can be exhaustively unit-tested, and the db layer
 * that applies a plan stays a thin, mechanical shell.
 *
 * Identity is the durable `CourseId` alone (ADR 0001). Title matching here only
 * *flags candidates* for a human — a split/merge/cross-list is never inferred
 * (ADR 0002); asserting "this new number IS the old course" is an admin decision.
 */
import {
  type CourseId,
  mintCourseId,
  normalizeCatalogKey,
  normalizeTitle,
} from "./identity";

export type CourseStatus = "active" | "retired";

/** A parsed catalog row, source-agnostic (the bulletin scrape shape lives in ingest). */
export interface IncomingCourse {
  subject: string;
  number: string;
  title: string;
  description: string | null;
  /**
   * Verbatim credit-hours token as published (e.g. "4", or "1-3" for a
   * variable-credit course), or null when absent. Kept as text — like the
   * prereq prose — so ranges aren't lost; a structured numeric model is a later
   * ticket (§9).
   */
  creditHours: string | null;
  prereqText: string | null;
}

/** The catalog-side attributes written onto a Course, last-import-wins. */
export interface CourseAttributes extends IncomingCourse {
  catalogYear: string;
}

/** What we already know, loaded from the DB before planning. */
export interface ExistingCourse {
  id: CourseId;
  /** Normalized current `(subject number)` key of this Course. */
  catalogKey: string;
  title: string;
  status: CourseStatus;
}

/** A resolved crosswalk edge: a catalog key that maps to a durable Course. */
export interface CrosswalkMapping {
  catalogKey: string;
  courseId: CourseId;
}

export interface CatalogSnapshot {
  courses: ExistingCourse[];
  crosswalk: CrosswalkMapping[];
  /** Normalized keys already sitting in the pending queue (idempotency). */
  pendingKeys: string[];
}

export type PendingReason = "possible-renumber" | "possible-cross-list";

export interface CreateCourseAction {
  courseId: CourseId;
  catalogKey: string;
  attributes: CourseAttributes;
}

export interface ApplyCourseAction {
  courseId: CourseId;
  catalogKey: string;
  attributes: CourseAttributes;
}

export interface PendingCrosswalkAction {
  catalogKey: string;
  title: string;
  reason: PendingReason;
  /** Durable Courses a human might map this incoming key onto. */
  candidateCourseIds: CourseId[];
  attributes: CourseAttributes;
}

export interface IngestPlan {
  creates: CreateCourseAction[];
  applies: ApplyCourseAction[];
  pendings: PendingCrosswalkAction[];
  retirements: CourseId[];
}

export interface PlanIngestOptions {
  catalogYear: string;
  /** Injected so plans are deterministic in tests; defaults to a real UUID. */
  mintId?: () => CourseId;
}

/**
 * Resolve a full catalog import into an idempotent {@link IngestPlan}.
 *
 * Invariants (ADR 0002 import contract):
 * - Existing mapped key → **apply** (last-import-wins; also flips status back to
 *   active, so a reappeared course un-retires).
 * - Unmapped key with no ambiguity → **create** a fresh durable Course.
 * - Unmapped key that looks like a renumber (existing active course, same title,
 *   different key) or a cross-list (two incoming rows share a title) → **pending**,
 *   never auto-applied. Already-pending keys are not re-queued.
 * - Any active Course no incoming row applied to → **retire** (status flip only).
 * - Reviews and Instructors are never referenced here — the plan only ever
 *   touches catalog-side Course/crosswalk state.
 */
export function planIngest(
  rows: IncomingCourse[],
  snapshot: CatalogSnapshot,
  options: PlanIngestOptions,
): IngestPlan {
  const mintId = options.mintId ?? mintCourseId;

  const mappingByKey = new Map(
    snapshot.crosswalk.map((m) => [m.catalogKey, m.courseId] as const),
  );
  const pendingKeys = new Set(snapshot.pendingKeys);
  const activeCourses = snapshot.courses.filter((c) => c.status === "active");

  // Every existing Course by its *current* key. If a key is absent from the
  // crosswalk yet a Course already carries it as its live `(subject number)`, that
  // Course simply is this key — apply and repair the missing crosswalk edge rather
  // than minting a second Course. This self-heals the non-atomic create in the db
  // layer (course inserted, crosswalk insert failed) so a re-run converges instead
  // of duplicating. Import always reads a repeated `(subject, number)` as the same
  // Course; a genuinely-new Course reusing a freed number is an admin decision.
  const courseByCurrentKey = new Map<string, ExistingCourse[]>();
  for (const c of snapshot.courses) {
    const list = courseByCurrentKey.get(c.catalogKey);
    if (list) list.push(c);
    else courseByCurrentKey.set(c.catalogKey, [c]);
  }

  // Count titles among the *unmapped* incoming rows so a shared title across new
  // numbers reads as a candidate cross-list. Rows whose key is already mapped are
  // established identities, so a new row sharing their title is a renumber
  // candidate (handled below), not an intra-import cross-list.
  const unmappedTitleCounts = new Map<string, number>();
  for (const row of rows) {
    if (mappingByKey.has(normalizeCatalogKey(row))) continue;
    const t = normalizeTitle(row.title);
    unmappedTitleCounts.set(t, (unmappedTitleCounts.get(t) ?? 0) + 1);
  }

  const plan: IngestPlan = {
    creates: [],
    applies: [],
    pendings: [],
    retirements: [],
  };
  const appliedCourseIds = new Set<CourseId>();

  for (const row of rows) {
    const catalogKey = normalizeCatalogKey(row);
    const attributes: CourseAttributes = {
      ...row,
      catalogYear: options.catalogYear,
    };

    const mapped = mappingByKey.get(catalogKey);
    if (mapped) {
      plan.applies.push({ courseId: mapped, catalogKey, attributes });
      appliedCourseIds.add(mapped);
      continue;
    }

    // Unmapped by the crosswalk, but a Course already carries this exact current
    // key → same Course; apply (and the db layer re-establishes the crosswalk).
    const currentMatches = courseByCurrentKey.get(catalogKey);
    if (currentMatches?.length === 1) {
      const courseId = currentMatches[0].id;
      plan.applies.push({ courseId, catalogKey, attributes });
      appliedCourseIds.add(courseId);
      continue;
    }

    // Unmapped key: distinguish a genuinely-new course from an ambiguous one.
    const titleKey = normalizeTitle(row.title);
    const renumberCandidates = activeCourses.filter(
      (c) => normalizeTitle(c.title) === titleKey && c.catalogKey !== catalogKey,
    );
    const isCrossList = (unmappedTitleCounts.get(titleKey) ?? 0) > 1;

    if (renumberCandidates.length > 0 || isCrossList) {
      if (pendingKeys.has(catalogKey)) continue; // already awaiting a human
      plan.pendings.push({
        catalogKey,
        title: row.title,
        reason: isCrossList ? "possible-cross-list" : "possible-renumber",
        candidateCourseIds: renumberCandidates.map((c) => c.id),
        attributes,
      });
      continue;
    }

    plan.creates.push({ courseId: mintId(), catalogKey, attributes });
  }

  // A course present before but not applied to this run has dropped out → retire.
  // Newly created courses were not active before, so they are never retired here.
  plan.retirements = activeCourses
    .filter((c) => !appliedCourseIds.has(c.id))
    .map((c) => c.id);

  return plan;
}
