"use server";

import { headers } from "next/headers";
import { getCurrentIdentityHash } from "@/auth/session";
import { isUuid, validateReviewReport } from "@/domain";
import { getReviewCourse, insertReviewReport } from "@/db/queries";
import { courseHref, formatCourseCode } from "@/lib/course-detail";
import { buildReviewReportEmail, sendOperatorEmail } from "@/lib/operator-mail";
import { siteOrigin } from "@/lib/site-origin";

/**
 * The report action's result (issue #27). `unknown` means the review doesn't
 * exist or is no longer published — there is nothing live to report; `invalid`
 * carries the field-level message the island shows inline.
 */
export type ReportResult =
  | { ok: true }
  | { ok: false; error: "unknown" }
  | { ok: false; error: "invalid"; field: "reason" | "details"; message: string };

/**
 * "Report this review" (v1-spec §11.B/§12; issue #27): the per-review,
 * post-publish flag. Writes a `review_reports` row and emails the operator the
 * review's id and link — the row is the record, the email the push, so the
 * operator never polls. Open to any reader (the spec gates only *authoring*
 * on `@auburn.edu`); a signed-in reporter's identity hash is recorded for
 * correlation, a signed-out one leaves it null. Arguments are re-validated
 * here: this is a public endpoint and the typed signature doesn't survive a
 * crafted POST.
 */
export async function reportReview(
  reviewId: string,
  reason: string,
  details: string,
): Promise<ReportResult> {
  if (!isUuid(reviewId)) return { ok: false, error: "unknown" };

  const validated = validateReviewReport({
    reason: String(reason ?? ""),
    details: String(details ?? ""),
  });
  if (!validated.ok) {
    return { ok: false, error: "invalid", field: validated.field, message: validated.message };
  }

  const review = await getReviewCourse(reviewId);
  if (!review) return { ok: false, error: "unknown" };

  const reporterIdentityHash = await getCurrentIdentityHash();
  await insertReviewReport({
    reviewId,
    reason: validated.reason,
    details: validated.details,
    reporterIdentityHash,
  });

  const h = await headers();
  const origin = siteOrigin({
    host: h.get("x-forwarded-host") ?? h.get("host"),
    proto: h.get("x-forwarded-proto"),
  });
  await sendOperatorEmail(
    buildReviewReportEmail({
      reviewId,
      reviewUrl: `${origin}${courseHref(review.subject, review.number)}#review-${reviewId}`,
      courseCode: formatCourseCode(review.subject, review.number),
      reason: validated.reason,
      details: validated.details,
      reportedBySignedIn: reporterIdentityHash !== null,
    }),
  );

  return { ok: true };
}
