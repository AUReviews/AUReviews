"use server";

import { revalidatePath } from "next/cache";
import { getCurrentIdentityHash } from "@/auth/session";
import {
  type VoteDirection,
  getReviewCourse,
  getReviewVoteCounts,
  setReviewVote,
} from "@/db/queries";
import { courseHref } from "@/lib/course-detail";

/**
 * The vote action's result (issue #25). On success it carries the review's
 * authoritative post-write tallies plus the caller's now-live vote, so the
 * island reconciles to server truth instead of client arithmetic. `signin`
 * means no valid session; `unknown` means the review doesn't exist or is no
 * longer published (votes only attach to live reviews).
 */
export type VoteResult =
  | { ok: true; up: number; down: number; myVote: VoteDirection | null }
  | { ok: false; error: "signin" | "unknown" };

/**
 * Set or clear the signed-in viewer's helpful vote on a review (v1-spec
 * §4/§5/§10; issue #25). The client states the DESIRED end state — `up`,
 * `down`, or `null` to retract — making the write idempotent: a re-click or
 * double-fire can't invert the intent the way a server-side toggle would.
 * Per-voter rows in `review_votes` are what make votes retractable and
 * flippable; one identity holds at most one live vote per review (the table's
 * composite key). The course page is then revalidated so the tallies bake
 * into the next static render, while this response updates the voter's own
 * view immediately.
 */
export async function castReviewVote(
  reviewId: string,
  direction: VoteDirection | null,
): Promise<VoteResult> {
  const identityHash = await getCurrentIdentityHash();
  if (!identityHash) return { ok: false, error: "signin" };

  // Re-validate the posted arguments — this is a public endpoint and the
  // typed signature doesn't survive a crafted POST. A malformed id is bounced
  // here rather than reaching Postgres as an invalid uuid cast.
  if (direction !== "up" && direction !== "down" && direction !== null) {
    return { ok: false, error: "unknown" };
  }
  if (!isUuid(reviewId)) return { ok: false, error: "unknown" };

  const review = await getReviewCourse(reviewId);
  if (!review) return { ok: false, error: "unknown" };

  await setReviewVote(reviewId, identityHash, direction);
  const counts = await getReviewVoteCounts(reviewId);

  revalidatePath(courseHref(review.subject, review.number));
  return { ok: true, up: counts.up, down: counts.down, myVote: direction };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
