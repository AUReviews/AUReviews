/**
 * My Activity presentation logic (v1-spec §11/§13; issue #26) — pure,
 * framework- and DB-free, following the same split as `course-reviews.ts`:
 * the `db` layer supplies the signed-in author's rows, the page renders
 * them, and every grouping and copy decision lives here where it is
 * unit-testable.
 */
import {
  DAY_MS,
  type InstructorUnknown,
  type ReviewLifecycle,
  purgeDeadline,
  reviewLifecycle,
} from "@/domain";

/** One of the signed-in author's own reviews, in every lifecycle state —
 * unlike `CourseReview`, removed and deleted rows are included, because this
 * page is the one place a takedown is surfaced (§11). */
export interface MyReview {
  id: string;
  courseSubject: string;
  courseNumber: string;
  courseTitle: string;
  instructorName: string | null;
  instructorUnknown: InstructorUnknown | null;
  termCode: string;
  overall: number;
  difficulty: number;
  workloadHours: number;
  body: string;
  status: string;
  edited: boolean;
  contested: boolean;
  removedReason: string | null;
  removedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  helpfulUp: number;
  helpfulDown: number;
}

/** One review the signed-in user has voted on, built from `review_votes`:
 * enough to link back to it and recall which way they voted. */
export interface MyVote {
  reviewId: string;
  direction: "up" | "down";
  votedAt: Date;
  courseSubject: string;
  courseNumber: string;
  courseTitle: string;
  reviewTermCode: string;
  reviewExcerpt: string;
  /** False when the review has since left the site (removed/deleted): the
   * vote is still listed, but there is nothing to link to. */
  reviewLive: boolean;
}

export type MyReviewGroups = Record<ReviewLifecycle, MyReview[]>;

/** A review past its retention window that purge-tombstones.sql has reduced
 * to id/course/identity/timestamps: nothing left to show. */
export function isTombstone(review: Pick<MyReview, "status" | "body">): boolean {
  return reviewLifecycle(review.status) === "deleted" && review.body === "";
}

/** Split the author's reviews into the three lifecycle sections the page
 * renders, newest first within each. Tombstones are dropped — the content
 * is gone, and the author deleted it (or saw its removal) long ago. */
export function groupMyReviews(reviews: MyReview[]): MyReviewGroups {
  const groups: MyReviewGroups = { live: [], removed: [], deleted: [] };
  for (const review of reviews) {
    if (isTombstone(review)) continue;
    groups[reviewLifecycle(review.status)].push(review);
  }
  const newestFirst = (a: MyReview, b: MyReview) =>
    b.createdAt.getTime() - a.createdAt.getTime();
  groups.live.sort(newestFirst);
  groups.removed.sort(newestFirst);
  groups.deleted.sort(newestFirst);
  return groups;
}

/** The §11 retention line under a removed or deleted review, or `null` for a
 * live one. Counts whole days remaining until the purge deadline. */
export function retentionNote(review: MyReview, now: Date): string | null {
  const deadline = purgeDeadline(review);
  if (!deadline) return null;
  const days = Math.ceil((deadline.getTime() - now.getTime()) / DAY_MS);
  if (days <= 0) return "Its content is due to be permanently erased.";
  return `Its content is kept for ${days} more ${days === 1 ? "day" : "days"}, then permanently erased.`;
}

/** A one-line excerpt of a review body for the "reviews you voted on" list. */
export function excerpt(body: string, max = 140): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).trimEnd()}…`;
}

/** A live review as its author's edit form loads it: every stored content
 * field, plus the course it is fixed to. */
export interface OwnReview {
  id: string;
  courseId: string;
  courseSubject: string;
  courseNumber: string;
  courseTitle: string;
  instructorId: string | null;
  instructorUnknown: InstructorUnknown | null;
  termCode: string;
  overall: number;
  difficulty: number;
  workloadHours: number;
  body: string;
  workloadShape: string[];
  grade: string | null;
  languages: string[];
  languagesOther: string | null;
  curved: string | null;
  attendance: string | null;
  prep: string | null;
  status: string;
}
