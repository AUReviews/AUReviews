"use server";

import { revalidatePath, updateTag } from "next/cache";
import { getCurrentIdentityHash } from "@/auth/session";
import { isUuid } from "@/domain";
import {
  contestOwnRemoval,
  getReviewCourseAnyStatus,
  softDeleteOwnReview,
} from "@/db/queries";
import { courseHref } from "@/lib/course-detail";

/** Result of a My Activity action (issue #26). `signin` means no valid
 * session; `unknown` means the review isn't the caller's or isn't in a state
 * the action applies to (already deleted, not removed, already contested). */
export type ActivityResult = { ok: true } | { ok: false; error: "signin" | "unknown" };

/**
 * Author self-delete (v1-spec §11; issue #26): a SOFT delete. The row is
 * stamped `status='deleted'` + `deleted_at` and keeps its content for the
 * ~30-day retention window (RETENTION_DAYS), after which the operator's purge
 * script reduces it to a tombstone. It leaves every aggregate and page
 * immediately. Ownership is the session → `identity_hash` → row chain; the
 * query's WHERE is the authorization check, so a forged id deletes nothing.
 */
export async function deleteMyReview(reviewId: string): Promise<ActivityResult> {
  const identityHash = await getCurrentIdentityHash();
  if (!identityHash) return { ok: false, error: "signin" };
  if (!isUuid(reviewId)) return { ok: false, error: "unknown" };

  const course = await getReviewCourseAnyStatus(reviewId);
  const deleted = await softDeleteOwnReview(reviewId, identityHash);
  if (!deleted) return { ok: false, error: "unknown" };

  // The review just left the site: its course page and the browse index's
  // rating columns must recompute (same pair `submitReview` invalidates).
  if (course) revalidatePath(courseHref(course.subject, course.number));
  updateTag("reviews");
  revalidatePath("/my");
  return { ok: true };
}

/**
 * "Contest this removal" (v1-spec §11; issue #26): flip `contested=true` on
 * the author's own removed review. Nothing else happens here — the operator
 * resolves it by hand (§12, runbook/contest-resolve.sql). Pressing it twice is
 * harmless: the second call matches no row and reports `unknown`.
 */
export async function contestMyRemoval(reviewId: string): Promise<ActivityResult> {
  const identityHash = await getCurrentIdentityHash();
  if (!identityHash) return { ok: false, error: "signin" };
  if (!isUuid(reviewId)) return { ok: false, error: "unknown" };

  const contested = await contestOwnRemoval(reviewId, identityHash);
  if (!contested) return { ok: false, error: "unknown" };
  revalidatePath("/my");
  return { ok: true };
}
