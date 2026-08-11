import { and, eq } from "drizzle-orm";
import {
  type CourseId,
  type InstructorId,
  type OfferingsPlan,
  type OfferingsSnapshot,
  offeringKey,
} from "@/domain";
import { getDb } from "./client";
import {
  courseCrosswalk,
  instructorPending,
  instructors,
  offeringInstructors,
  offerings,
} from "./schema";

/**
 * DB offerings layer (issue #23) — the thin, mechanical shell around the pure
 * offerings planner, exactly like `catalog.ts` around the crosswalk planner.
 * `loadOfferingsSnapshot` reads current offering-side state;
 * `applyOfferingsPlan` writes an {@link OfferingsPlan} back. All invariants
 * live in the domain planner; this file only translates a plan into SQL.
 *
 * Neon-http has no interactive transaction, so writes are sequential, made
 * safe by idempotency: minted ids plus the composite `(course_id, term_code)`
 * and `(course_id, term_code, instructor_id)` keys and the unique
 * `instructors.banner_key` / `instructor_pending.name_key` mean a re-run
 * (even after a partial failure) converges without duplicating. No write here
 * ever deletes an Instructor or touches a Review (ADR 0002).
 */

/** Read everything the offerings planner needs to resolve the next import. */
export async function loadOfferingsSnapshot(): Promise<OfferingsSnapshot> {
  const db = getDb();

  const [crosswalkRows, instructorRows, offeringRows, linkRows, pendingRows] =
    await Promise.all([
      db
        .select({
          catalogKey: courseCrosswalk.catalogKey,
          courseId: courseCrosswalk.courseId,
        })
        .from(courseCrosswalk),
      db
        .select({
          id: instructors.id,
          displayName: instructors.displayName,
          bannerKey: instructors.bannerKey,
          nameKey: instructors.nameKey,
        })
        .from(instructors),
      db
        .select({
          courseId: offerings.courseId,
          termCode: offerings.termCode,
        })
        .from(offerings),
      db
        .select({
          courseId: offeringInstructors.courseId,
          termCode: offeringInstructors.termCode,
          instructorId: offeringInstructors.instructorId,
        })
        .from(offeringInstructors),
      db
        .select({ nameKey: instructorPending.nameKey })
        .from(instructorPending)
        .where(eq(instructorPending.status, "pending")),
    ]);

  const linksByOffering = new Map<string, InstructorId[]>();
  for (const link of linkRows) {
    const key = offeringKey(link.courseId as CourseId, link.termCode);
    const list = linksByOffering.get(key);
    if (list) list.push(link.instructorId as InstructorId);
    else linksByOffering.set(key, [link.instructorId as InstructorId]);
  }

  return {
    crosswalk: crosswalkRows.map((m) => ({
      catalogKey: m.catalogKey,
      courseId: m.courseId as CourseId,
    })),
    instructors: instructorRows.map((i) => ({
      id: i.id as InstructorId,
      displayName: i.displayName,
      bannerKey: i.bannerKey,
      nameKey: i.nameKey,
    })),
    offerings: offeringRows.map((o) => ({
      courseId: o.courseId as CourseId,
      termCode: o.termCode,
      instructorIds:
        linksByOffering.get(offeringKey(o.courseId as CourseId, o.termCode)) ??
        [],
    })),
    pendingNameKeys: pendingRows.map((p) => p.nameKey),
  };
}

/** Write a resolved plan back to Postgres (idempotent; see file header). */
export async function applyOfferingsPlan(plan: OfferingsPlan): Promise<void> {
  const db = getDb();
  const now = new Date();

  for (const create of plan.instructorCreates) {
    await db
      .insert(instructors)
      .values(create)
      .onConflictDoNothing({ target: instructors.id });
  }

  for (const rename of plan.instructorRenames) {
    // Display name is a mutable attribute, last-import-wins (§3); the durable
    // id — and every offering link and future review pointing at it — holds.
    await db
      .update(instructors)
      .set({ displayName: rename.displayName, updatedAt: now })
      .where(eq(instructors.id, rename.id));
  }

  for (const pending of plan.instructorPendings) {
    await db
      .insert(instructorPending)
      .values({
        nameKey: pending.nameKey,
        displayName: pending.displayName,
        bannerKey: pending.bannerKey,
        reason: pending.reason,
        candidateInstructorIds: pending.candidateInstructorIds,
        payload: pending,
      })
      .onConflictDoNothing({ target: instructorPending.nameKey });
  }

  for (const create of plan.offeringCreates) {
    await db
      .insert(offerings)
      .values(create)
      .onConflictDoNothing({
        target: [offerings.courseId, offerings.termCode],
      });
  }

  for (const link of plan.linkAdds) {
    await db
      .insert(offeringInstructors)
      .values(link)
      .onConflictDoNothing({
        target: [
          offeringInstructors.courseId,
          offeringInstructors.termCode,
          offeringInstructors.instructorId,
        ],
      });
  }

  // Links are catalog-side and re-derivable: dropped when Banner drops them.
  // The Instructor rows they reference are never deleted (ADR 0002).
  for (const removal of plan.linkRemovals) {
    await db
      .delete(offeringInstructors)
      .where(
        and(
          eq(offeringInstructors.courseId, removal.courseId),
          eq(offeringInstructors.termCode, removal.termCode),
          eq(offeringInstructors.instructorId, removal.instructorId),
        ),
      );
  }
}
