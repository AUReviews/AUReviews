/**
 * Offering/Instructor resolution (v1-spec §3/§6/§9, ADR 0001/0002; issue #23).
 *
 * Given one Banner import (section rows already collapsed to `(Course, Term)`
 * grain) and a snapshot of what we already know, decide which durable
 * Instructor identities to mint, which existing ones each row refers to, and
 * which offering/link rows to write. Like `crosswalk.ts`, this module is pure
 * (no framework, no persistence, no clock, ids from an injected minter), so the
 * import-contract invariants are exhaustively unit-testable and the db layer
 * stays a thin shell.
 *
 * Identity rules (§3):
 * - An Instructor is keyed on Banner's stable person key where one exists
 *   (the Auburn NetID lifted from the schedule page's `mailto:` link), else on
 *   the normalized display name.
 * - Display name is a mutable attribute (last-import-wins rename); identity is
 *   the durable {@link InstructorId} alone.
 * - An ambiguous match (a new Banner key colliding with an existing name, or a
 *   keyless name matching several instructors) surfaces as a *pending* admin
 *   decision, never auto-merged, mirroring the course crosswalk.
 *
 * Import contract (ADR 0002): idempotent; offerings and instructor links are
 * catalog-side and re-derivable (links may be dropped when Banner drops them),
 * but a durable Instructor is never deleted; no such action even exists in
 * the plan shape.
 */
import {
  type CourseId,
  type InstructorId,
  mintInstructorId,
  normalizeCatalogKey,
  normalizeInstructorName,
} from "./identity";
import type { CrosswalkMapping } from "./crosswalk";

/** One instructor as scraped off a Banner schedule row. */
export interface IncomingInstructor {
  displayName: string;
  /** Auburn NetID from the `mailto:` link, or null when Banner shows none. */
  bannerKey: string | null;
}

/** One Banner section row: course code + its instructor list. Sections are
 * deliberately not modeled (§3); this shape exists only to be collapsed. */
export interface IncomingSection {
  subject: string;
  number: string;
  instructors: IncomingInstructor[];
}

/** A collapsed import row at the modeled `(Course, Term)` grain. */
export interface IncomingOffering {
  catalogKey: string;
  termCode: string;
  instructors: IncomingInstructor[];
}

export interface ExistingInstructor {
  id: InstructorId;
  displayName: string;
  bannerKey: string | null;
  nameKey: string;
}

export interface ExistingOffering {
  courseId: CourseId;
  termCode: string;
  instructorIds: InstructorId[];
}

/** What we already know, loaded from the DB before planning. */
export interface OfferingsSnapshot {
  /** Catalog-key → durable Course mappings (the course crosswalk, #18). */
  crosswalk: CrosswalkMapping[];
  instructors: ExistingInstructor[];
  offerings: ExistingOffering[];
  /** Name keys already sitting in the pending queue (idempotency). */
  pendingNameKeys: string[];
}

export interface CreateInstructorAction {
  id: InstructorId;
  displayName: string;
  bannerKey: string | null;
  nameKey: string;
}

/** Last-import-wins display-name update on an existing Instructor. */
export interface RenameInstructorAction {
  id: InstructorId;
  displayName: string;
}

export type InstructorPendingReason = "ambiguous-instructor-match";

/** Where an instructor sighting occurred: which course listing, which term. */
export interface InstructorSighting {
  catalogKey: string;
  termCode: string;
}

export interface PendingInstructorAction {
  nameKey: string;
  displayName: string;
  bannerKey: string | null;
  reason: InstructorPendingReason;
  /** Durable Instructors a human might resolve this sighting onto. */
  candidateInstructorIds: InstructorId[];
  /** Where this ambiguous sighting first appeared, for admin context. */
  firstSeen: InstructorSighting;
}

export interface OfferingKey {
  courseId: CourseId;
  termCode: string;
}

/** The composite map/lookup key for an Offering: one definition shared by the
 * planner and the db layer so the two can never encode it differently. */
export function offeringKey(courseId: CourseId, termCode: string): string {
  return `${courseId} ${termCode}`;
}

/** The key one incoming instructor sighting dedupes/resolves under: the stable
 * Banner NetID where present, else the normalized display name. One definition
 * shared by the parser, the section collapse, and the planner. */
export function instructorDedupeKey(instructor: IncomingInstructor): string {
  return (
    instructor.bannerKey ??
    `name:${normalizeInstructorName(instructor.displayName)}`
  );
}

export interface OfferingLink extends OfferingKey {
  instructorId: InstructorId;
}

export interface OfferingsPlan {
  instructorCreates: CreateInstructorAction[];
  instructorRenames: RenameInstructorAction[];
  instructorPendings: PendingInstructorAction[];
  offeringCreates: OfferingKey[];
  linkAdds: OfferingLink[];
  /** Links whose instructor Banner no longer lists for that (course, term).
   * Catalog-side and re-derivable; the Instructor itself is never deleted. */
  linkRemovals: OfferingLink[];
  /** Banner course keys with no crosswalk mapping: skipped, never guessed. */
  unmatchedCatalogKeys: string[];
}

export interface PlanOfferingsOptions {
  /** Injected so plans are deterministic in tests; defaults to a real UUID. */
  mintId?: () => InstructorId;
}

/**
 * Collapse one term's section rows into `(Course, Term)` offering rows,
 * unioning each course's sections into a single instructor-of-record set.
 * Instructors are deduped by Banner key where present, else normalized name.
 */
export function collapseSections(
  termCode: string,
  sections: IncomingSection[],
): IncomingOffering[] {
  const byCourse = new Map<
    string,
    { seen: Set<string>; instructors: IncomingInstructor[] }
  >();

  for (const section of sections) {
    const catalogKey = normalizeCatalogKey(section);
    let entry = byCourse.get(catalogKey);
    if (!entry) {
      entry = { seen: new Set(), instructors: [] };
      byCourse.set(catalogKey, entry);
    }
    for (const instructor of section.instructors) {
      const dedupeKey = instructorDedupeKey(instructor);
      if (entry.seen.has(dedupeKey)) continue;
      entry.seen.add(dedupeKey);
      entry.instructors.push(instructor);
    }
  }

  return [...byCourse.entries()].map(([catalogKey, entry]) => ({
    catalogKey,
    termCode,
    instructors: entry.instructors,
  }));
}

/** How one incoming instructor sighting resolved during planning. */
type Resolution =
  | { kind: "resolved"; id: InstructorId }
  | { kind: "pending" };

/**
 * Resolve a full Banner import into an idempotent {@link OfferingsPlan}.
 * See the module header for the identity and import-contract rules.
 */
export function planOfferings(
  rows: IncomingOffering[],
  snapshot: OfferingsSnapshot,
  options: PlanOfferingsOptions = {},
): OfferingsPlan {
  const mintId = options.mintId ?? mintInstructorId;

  const courseByCatalogKey = new Map(
    snapshot.crosswalk.map((m) => [m.catalogKey, m.courseId] as const),
  );
  const byBannerKey = new Map<string, ExistingInstructor>();
  const byNameKey = new Map<string, ExistingInstructor[]>();
  for (const instructor of snapshot.instructors) {
    if (instructor.bannerKey) byBannerKey.set(instructor.bannerKey, instructor);
    const list = byNameKey.get(instructor.nameKey);
    if (list) list.push(instructor);
    else byNameKey.set(instructor.nameKey, [instructor]);
  }
  const existingOfferings = new Map(
    snapshot.offerings.map(
      (o) => [offeringKey(o.courseId, o.termCode), o] as const,
    ),
  );
  const pendingNameKeys = new Set(snapshot.pendingNameKeys);

  const plan: OfferingsPlan = {
    instructorCreates: [],
    instructorRenames: [],
    instructorPendings: [],
    offeringCreates: [],
    linkAdds: [],
    linkRemovals: [],
    unmatchedCatalogKeys: [],
  };

  // Sightings resolved earlier in this same run (minted creates included), so
  // one person appearing across many courses/terms yields one identity and one
  // rename at most. Keyed like collapseSections dedupes.
  const resolvedThisRun = new Map<string, Resolution>();
  const renamedIds = new Set<InstructorId>();
  const unmatchedReported = new Set<string>();

  const queuePending = (
    incoming: IncomingInstructor,
    nameKey: string,
    candidates: ExistingInstructor[],
    firstSeen: InstructorSighting,
  ): void => {
    if (pendingNameKeys.has(nameKey)) return; // already awaiting a human
    pendingNameKeys.add(nameKey);
    plan.instructorPendings.push({
      nameKey,
      displayName: incoming.displayName,
      bannerKey: incoming.bannerKey,
      reason: "ambiguous-instructor-match",
      candidateInstructorIds: candidates.map((c) => c.id),
      firstSeen,
    });
  };

  const resolveInstructor = (
    incoming: IncomingInstructor,
    firstSeen: InstructorSighting,
  ): Resolution => {
    const nameKey = normalizeInstructorName(incoming.displayName);
    const runKey = instructorDedupeKey(incoming);

    const priorResolution = resolvedThisRun.get(runKey);
    if (priorResolution) return priorResolution;

    const resolution = ((): Resolution => {
      // 1. A stable Banner person key match is the person (§3).
      if (incoming.bannerKey) {
        const existing = byBannerKey.get(incoming.bannerKey);
        if (existing) {
          if (
            existing.displayName !== incoming.displayName &&
            !renamedIds.has(existing.id)
          ) {
            renamedIds.add(existing.id);
            plan.instructorRenames.push({
              id: existing.id,
              displayName: incoming.displayName,
            });
          }
          return { kind: "resolved", id: existing.id };
        }

        // A new Banner key whose name matches existing instructor(s): possibly
        // the same person finally exposing a key, possibly a namesake. Never
        // auto-merged; surface for an admin (ADR 0002 philosophy).
        const nameMatches = byNameKey.get(nameKey) ?? [];
        if (nameMatches.length > 0) {
          queuePending(incoming, nameKey, nameMatches, firstSeen);
          return { kind: "pending" };
        }
      } else {
        // 2. Keyless: normalized name is the fallback key. One match is that
        // person; several is ambiguous and goes to a human.
        const nameMatches = byNameKey.get(nameKey) ?? [];
        if (nameMatches.length === 1) {
          return { kind: "resolved", id: nameMatches[0].id };
        }
        if (nameMatches.length > 1) {
          queuePending(incoming, nameKey, nameMatches, firstSeen);
          return { kind: "pending" };
        }
      }

      // 3. Genuinely new person: mint a durable identity (ADR 0001).
      const created: CreateInstructorAction = {
        id: mintId(),
        displayName: incoming.displayName,
        bannerKey: incoming.bannerKey,
        nameKey,
      };
      plan.instructorCreates.push(created);
      // Later keyless sightings of this name in the same run resolve here too.
      byNameKey.set(nameKey, [
        ...(byNameKey.get(nameKey) ?? []),
        { ...created },
      ]);
      if (created.bannerKey) byBannerKey.set(created.bannerKey, { ...created });
      return { kind: "resolved", id: created.id };
    })();

    resolvedThisRun.set(runKey, resolution);
    return resolution;
  };

  // Process newest term first. Each person resolves once per run (first
  // sighting wins the resolution cache), so this ordering is what makes the
  // display name latest-wins: the newest Banner spelling is the one minted or
  // renamed to, regardless of the order the caller fetched terms in.
  const orderedRows = [...rows].sort((a, b) =>
    a.termCode < b.termCode ? 1 : a.termCode > b.termCode ? -1 : 0,
  );

  for (const row of orderedRows) {
    const courseId = courseByCatalogKey.get(row.catalogKey);
    if (!courseId) {
      // Banner knows a course the crosswalk doesn't (e.g. long-retired, never
      // in the current bulletin). Minting a Course from Banner alone would
      // bypass the crosswalk; report and skip instead.
      if (!unmatchedReported.has(row.catalogKey)) {
        unmatchedReported.add(row.catalogKey);
        plan.unmatchedCatalogKeys.push(row.catalogKey);
      }
      continue;
    }

    const existing = existingOfferings.get(offeringKey(courseId, row.termCode));
    if (!existing) {
      plan.offeringCreates.push({ courseId, termCode: row.termCode });
    }

    const linkedBefore = new Set(existing?.instructorIds ?? []);
    const linkedNow = new Set<InstructorId>();
    for (const instructor of row.instructors) {
      const resolution = resolveInstructor(instructor, {
        catalogKey: row.catalogKey,
        termCode: row.termCode,
      });
      if (resolution.kind !== "resolved") continue;
      if (linkedNow.has(resolution.id)) continue;
      linkedNow.add(resolution.id);
      if (!linkedBefore.has(resolution.id)) {
        plan.linkAdds.push({
          courseId,
          termCode: row.termCode,
          instructorId: resolution.id,
        });
      }
    }

    // Only offerings present in THIS import may shed links; Banner is
    // authoritative for the terms it was asked about, nothing else.
    for (const instructorId of linkedBefore) {
      if (!linkedNow.has(instructorId)) {
        plan.linkRemovals.push({
          courseId,
          termCode: row.termCode,
          instructorId,
        });
      }
    }
  }

  return plan;
}
