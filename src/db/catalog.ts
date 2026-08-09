import { eq, inArray } from "drizzle-orm";
import {
  type CatalogSnapshot,
  type CourseId,
  type IngestPlan,
  normalizeCatalogKey,
} from "@/domain";
import { getDb } from "./client";
import { courseCrosswalk, courses, crosswalkPending } from "./schema";

/**
 * DB catalog layer (issue #18) — the thin, mechanical shell around the pure
 * crosswalk planner. `loadCatalogSnapshot` reads the current catalog-side state;
 * `applyCatalogPlan` writes an {@link IngestPlan} back. All the invariants live
 * in the domain planner; this file only translates a plan into SQL.
 *
 * The neon-http driver has no interactive transaction, so the writes below are
 * sequential rather than atomic. That is safe here precisely because the plan is
 * idempotent: minted ids and the unique `catalog_key` mean a re-run (even after a
 * partial failure) converges to the same state without duplicating Courses. No
 * write here ever touches a Review — the plan only carries catalog-side actions
 * (ADR 0002).
 */

/** Read everything the crosswalk planner needs to resolve the next import. */
export async function loadCatalogSnapshot(): Promise<CatalogSnapshot> {
  const db = getDb();

  const [courseRows, crosswalkRows, pendingRows] = await Promise.all([
    db
      .select({
        id: courses.id,
        subject: courses.subject,
        number: courses.number,
        title: courses.title,
        status: courses.status,
      })
      .from(courses),
    db
      .select({
        catalogKey: courseCrosswalk.catalogKey,
        courseId: courseCrosswalk.courseId,
      })
      .from(courseCrosswalk),
    db
      .select({ catalogKey: crosswalkPending.catalogKey })
      .from(crosswalkPending)
      .where(eq(crosswalkPending.status, "pending")),
  ]);

  return {
    courses: courseRows.map((c) => ({
      id: c.id as CourseId,
      catalogKey: normalizeCatalogKey(c),
      title: c.title,
      // `status` is free text in the DB; anything unexpected is treated as active.
      status: c.status === "retired" ? "retired" : "active",
    })),
    crosswalk: crosswalkRows.map((m) => ({
      catalogKey: m.catalogKey,
      courseId: m.courseId as CourseId,
    })),
    pendingKeys: pendingRows.map((p) => p.catalogKey),
  };
}

/** Write a resolved plan back to Postgres (idempotent; see file header). */
export async function applyCatalogPlan(plan: IngestPlan): Promise<void> {
  const db = getDb();
  const now = new Date();

  for (const create of plan.creates) {
    await db
      .insert(courses)
      .values({ id: create.courseId, status: "active", ...create.attributes })
      .onConflictDoNothing({ target: courses.id });
    await db
      .insert(courseCrosswalk)
      .values({ catalogKey: create.catalogKey, courseId: create.courseId })
      .onConflictDoNothing({ target: courseCrosswalk.catalogKey });
  }

  for (const apply of plan.applies) {
    // Last-import-wins on the catalog attributes; `active` also un-retires a
    // course that reappeared. A same-number *rename* changes the title here —
    // historising the prior identity into `former_identities` needs catalog-year
    // range tracking and is a deliberate follow-up (renumbers route through
    // pending, not apply), so the column stays unwritten for now.
    await db
      .update(courses)
      .set({ status: "active", updatedAt: now, ...apply.attributes })
      .where(eq(courses.id, apply.courseId));
    // Re-establish the crosswalk edge if it went missing (repair path from the
    // planner), making the non-atomic create self-heal on the next run.
    await db
      .insert(courseCrosswalk)
      .values({ catalogKey: apply.catalogKey, courseId: apply.courseId })
      .onConflictDoNothing({ target: courseCrosswalk.catalogKey });
  }

  for (const pending of plan.pendings) {
    await db
      .insert(crosswalkPending)
      .values({
        catalogKey: pending.catalogKey,
        title: pending.title,
        reason: pending.reason,
        candidateCourseIds: pending.candidateCourseIds,
        payload: pending.attributes,
      })
      .onConflictDoNothing({ target: crosswalkPending.catalogKey });
  }

  if (plan.retirements.length > 0) {
    await db
      .update(courses)
      .set({ status: "retired", updatedAt: now })
      .where(inArray(courses.id, plan.retirements));
  }
}
