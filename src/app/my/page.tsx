import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentIdentityHash } from "@/auth/session";
import { canContestRemoval, removalReasonLabel } from "@/domain";
import { listMyReviews, listMyVotes } from "@/db/queries";
import { courseHref, formatCourseCode } from "@/lib/course-detail";
import { formatReviewDate, formatReviewTerm } from "@/lib/course-reviews";
import {
  type MyReview,
  type MyVote,
  groupMyReviews,
  retentionNote,
} from "@/lib/my-activity";
import { ContestRemoval, LiveReviewActions } from "./ReviewActions";

// My Activity (v1-spec §11/§13; issue #26) — the signed-in author's one
// pull-only page: their own reviews with helpful scores and edit/delete, any
// REMOVED review with its reason and "Contest this removal", and the reviews
// they've voted on. It is the ONLY place a takedown is surfaced (§11
// "author-notified, publicly silent"): there is no stored email→review link
// to push a notification to, so this page must exist for the moderation
// model to function. Everything is resolved server-side from the session →
// `identity_hash` (§7); the hash itself never reaches the client.
//
// Per-user and never cached — force-dynamic, like /signin and the review form.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "My activity — AUReviews" };

export default async function MyActivityPage() {
  const identityHash = await getCurrentIdentityHash();
  if (!identityHash) {
    return (
      <div className="my">
        <div className="my-card">
          <h1>My activity</h1>
          <p className="lede">
            Sign in with your Auburn email to see and manage your reviews.
          </p>
          <p>
            <Link href="/signin" className="btn-accent">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  const [reviews, votes] = await Promise.all([
    listMyReviews(identityHash),
    listMyVotes(identityHash),
  ]);
  const groups = groupMyReviews(reviews);
  const now = new Date();

  return (
    <div className="my">
      <div className="my-card">
        <h1>My activity</h1>
        <p className="lede">
          Your reviews and votes, tied to your verified Auburn email by a
          non-reversible token — nobody else can see this page. If a review of
          yours is ever removed, this is where you&apos;ll find out why.
        </p>

        {groups.removed.length > 0 && (
          <section className="my-section" aria-labelledby="my-removed">
            <h2 id="my-removed">Removed reviews</h2>
            <p className="muted">
              These were taken down by the site operator against the published
              review guidelines. They no longer appear anywhere on the site. If
              you think a removal was a mistake, contest it and the operator
              will take a second look.
            </p>
            <div className="stack">
              {groups.removed.map((r) => (
                <RemovedReviewCard key={r.id} review={r} now={now} />
              ))}
            </div>
          </section>
        )}

        <section className="my-section" aria-labelledby="my-reviews">
          <h2 id="my-reviews">Your reviews</h2>
          {groups.live.length === 0 ? (
            <p className="muted">
              You haven&apos;t posted any reviews yet.{" "}
              <Link href="/reviews/new">Add one</Link>.
            </p>
          ) : (
            <div className="stack">
              {groups.live.map((r) => (
                <LiveReviewCard key={r.id} review={r} />
              ))}
            </div>
          )}
        </section>

        {groups.deleted.length > 0 && (
          <section className="my-section" aria-labelledby="my-deleted">
            <h2 id="my-deleted">Deleted reviews</h2>
            <p className="muted">
              Reviews you deleted. They are gone from the site; their content
              is kept briefly for abuse forensics, then erased.
            </p>
            <div className="stack">
              {groups.deleted.map((r) => (
                <DeletedReviewCard key={r.id} review={r} now={now} />
              ))}
            </div>
          </section>
        )}

        <section className="my-section" aria-labelledby="my-votes">
          <h2 id="my-votes">Reviews you voted on</h2>
          {votes.length === 0 ? (
            <p className="muted">
              You haven&apos;t voted on any reviews yet. Helpful votes rank the
              reviews on each course page.
            </p>
          ) : (
            <ul className="my-votes">
              {votes.map((v) => (
                <VoteRow key={v.reviewId} vote={v} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/** The course line every card opens with: `COMP 3270 · Title`, linked. */
function CourseLine({ review }: { review: MyReview }) {
  return (
    <Link
      href={courseHref(review.courseSubject, review.courseNumber)}
      className="my-course"
    >
      {formatCourseCode(review.courseSubject, review.courseNumber)} ·{" "}
      {review.courseTitle}
    </Link>
  );
}

function instructorLine(review: MyReview): string {
  if (review.instructorName) return review.instructorName;
  return review.instructorUnknown === "dont-remember"
    ? "Professor not remembered"
    : "Professor not listed";
}

/** A live (published or queued) review: the same numbers + body a course page
 * shows, its helpful score, and Edit/Delete. */
function LiveReviewCard({ review }: { review: MyReview }) {
  return (
    <article className="review my-review" id={`review-${review.id}`}>
      <CourseLine review={review} />
      <div className="review-head">
        <span className="stat">
          Overall {review.overall} · Difficulty {review.difficulty} ·{" "}
          {review.workloadHours} hrs/wk
        </span>
        <span className="when">
          {formatReviewDate(review.createdAt)}
          {review.edited && " · edited"}
          {review.status === "pending" && " · awaiting review"}
        </span>
      </div>
      <div className="review-meta">
        <span>{instructorLine(review)}</span>
        <span className="review-term">{formatReviewTerm(review.termCode)}</span>
      </div>
      <p>{review.body}</p>
      <div className="helpful">
        <span className="helpful-label">Helpful score</span>
        <span className="my-score">
          {review.helpfulUp} up · {review.helpfulDown} down
        </span>
        {review.status === "published" && (
          <Link
            href={`${courseHref(review.courseSubject, review.courseNumber)}#review-${review.id}`}
            className="my-link"
          >
            View on course page
          </Link>
        )}
      </div>
      <LiveReviewActions reviewId={review.id} />
    </article>
  );
}

/** A removed review (§11): the reason the operator recorded, the retention
 * line, and "Contest this removal" (or the contested state once pressed). */
function RemovedReviewCard({ review, now }: { review: MyReview; now: Date }) {
  return (
    <article className="review my-review my-removed" id={`review-${review.id}`}>
      <CourseLine review={review} />
      <div className="review-head">
        <span className="stat">
          Overall {review.overall} · Difficulty {review.difficulty} ·{" "}
          {review.workloadHours} hrs/wk
        </span>
        <span className="when">
          {formatReviewDate(review.createdAt)} · removed
          {review.removedAt && ` ${formatReviewDate(review.removedAt)}`}
        </span>
      </div>
      <div className="review-meta">
        <span>{instructorLine(review)}</span>
        <span className="review-term">{formatReviewTerm(review.termCode)}</span>
      </div>
      <p className="my-reason">
        <strong>Reason:</strong> {removalReasonLabel(review.removedReason)}
      </p>
      <p>{review.body}</p>
      <p className="muted my-retention">{retentionNote(review, now)}</p>
      {canContestRemoval(review) ? (
        <ContestRemoval reviewId={review.id} />
      ) : (
        <p className="my-contested" role="status">
          You&apos;ve contested this removal. The operator will review it and,
          if it was a mistake, put the review back.
        </p>
      )}
    </article>
  );
}

/** A self-deleted review inside its retention window (§11). */
function DeletedReviewCard({ review, now }: { review: MyReview; now: Date }) {
  return (
    <article className="review my-review my-deleted" id={`review-${review.id}`}>
      <CourseLine review={review} />
      <div className="review-head">
        <span className="stat">
          Overall {review.overall} · Difficulty {review.difficulty} ·{" "}
          {review.workloadHours} hrs/wk
        </span>
        <span className="when">
          {formatReviewDate(review.createdAt)} · deleted
          {review.deletedAt && ` ${formatReviewDate(review.deletedAt)}`}
        </span>
      </div>
      <p className="muted my-retention">{retentionNote(review, now)}</p>
    </article>
  );
}

/** One voted-on review: which way, on what, linked when the review is live. */
function VoteRow({ vote }: { vote: MyVote }) {
  const code = formatCourseCode(vote.courseSubject, vote.courseNumber);
  const href = `${courseHref(vote.courseSubject, vote.courseNumber)}#review-${vote.reviewId}`;
  return (
    <li className="my-vote">
      <span className={`my-vote-dir ${vote.direction}`}>
        {vote.direction === "up" ? "Helpful" : "Not helpful"}
      </span>
      <span className="my-vote-body">
        {vote.reviewLive ? (
          <Link href={href}>
            {code} · {formatReviewTerm(vote.reviewTermCode)}
          </Link>
        ) : (
          <span>
            {code} · {formatReviewTerm(vote.reviewTermCode)}{" "}
            <span className="muted">(no longer on the site)</span>
          </span>
        )}
        <span className="my-vote-excerpt">{vote.reviewExcerpt}</span>
      </span>
      <span className="when">{formatReviewDate(vote.votedAt)}</span>
    </li>
  );
}
