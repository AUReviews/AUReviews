import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentIdentityHash } from "@/auth/session";
import { isUuid } from "@/domain";
import { getOwnEditableReview, listCourseInstructors } from "@/db/queries";
import { formatCourseCode } from "@/lib/course-detail";
import { formatReviewTerm } from "@/lib/course-reviews";
import { toCourseOption } from "@/lib/course-search";
import ReviewForm from "../../new/ReviewForm";

// Edit an existing review (v1-spec §11; issue #26). The SAME form as /reviews/new
// in edit mode: course and term fixed, every other field prefilled, and the
// `updateReview` action re-running the full submit pipeline so an edit can't
// slip past the door. Reached only from My Activity.
//
// Authorization is the session → `identity_hash` → row-ownership chain: the
// review is loaded scoped to the caller's hash, so someone else's review — or
// one that's been removed/deleted — is simply not found. A signed-out visitor
// is sent to sign in; there's no inline-auth path here since the review to
// edit can't even be identified without a session.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Edit your review — AUReviews" };

export default async function EditReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const identityHash = await getCurrentIdentityHash();
  if (!identityHash) redirect("/signin");

  const review = await getOwnEditableReview(id, identityHash);
  if (!review) notFound();

  const instructors = await listCourseInstructors(review.courseId);
  const prefill = {
    course: toCourseOption({
      id: review.courseId,
      subject: review.courseSubject,
      number: review.courseNumber,
      title: review.courseTitle,
    }),
    instructors,
  };

  return (
    <div className="add">
      <ReviewForm
        prefill={prefill}
        // The only selectable term is the review's own; the form renders it
        // read-only and posts it back as a hidden field.
        terms={[{ code: review.termCode, label: formatReviewTerm(review.termCode) }]}
        signedIn
        edit={{
          reviewId: review.id,
          termLabel: `${formatReviewTerm(review.termCode)} · ${formatCourseCode(review.courseSubject, review.courseNumber)}`,
          initial: {
            instructorId: review.instructorId,
            instructorUnknown: review.instructorUnknown,
            termCode: review.termCode,
            overall: review.overall,
            difficulty: review.difficulty,
            workloadHours: review.workloadHours,
            body: review.body,
            workloadShape: review.workloadShape,
            grade: review.grade,
            languages: review.languages,
            languagesOther: review.languagesOther,
            curved: review.curved,
            attendance: review.attendance,
            prep: review.prep,
          },
        }}
      />
    </div>
  );
}
