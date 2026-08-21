/**
 * "Report this review" rules (v1-spec §11/§12; issue #27) — the pure core
 * behind the per-review, post-publish moderation surface (§11.B): a reader
 * picks one of the guideline categories below and optionally says more. It is
 * pull-based: the operator acts only when a report arrives (§11.B "never
 * proactively scans"). Bugs and feature requests go to GitHub issues instead
 * (footer links) — there is no site-side general-concern form in v1.
 *
 * Every option offered here is deliberately neutral and descriptive — the
 * site must never supply an accusatory prompt (§10, the *Roommates.com*
 * material-contribution line); any substantive claim originates in the
 * reader's free text.
 *
 * Like `review.ts`, this reads no env, DB, or request: the server action calls
 * the validator as the authoritative gate and the island reuses the options.
 */

/** The §11 "prohibited (takedown-eligible)" categories, as report reasons. */
export const REPORT_REASONS = [
  { value: "off-topic", label: "Wrong course or off-topic" },
  { value: "identifying-info", label: "Contains identifying or contact info" },
  { value: "misconduct-accusation", label: "Accuses someone of misconduct" },
  {
    value: "protected-characteristic",
    label: "Remarks on protected characteristics or appearance",
  },
  {
    value: "not-about-course",
    label: "About a TA or another student, not the course",
  },
  { value: "profanity", label: "Profanity" },
  { value: "spam", label: "Spam, impersonation, or self-review" },
  { value: "other", label: "Something else" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

/** Free-text cap on the optional "tell us more" field. */
export const REPORT_DETAILS_MAX_LENGTH = 1000;

export type ReviewReportResult =
  | { ok: true; reason: ReportReason; details: string | null }
  | { ok: false; field: "reason" | "details"; message: string };

/**
 * Validate a "Report this review" submission. `details` is optional for every
 * guideline category but required for `other` — a bare "something else" gives
 * the operator nothing to act on.
 */
export function validateReviewReport(input: {
  reason: string | null;
  details: string | null;
}): ReviewReportResult {
  const reason = REPORT_REASONS.find((r) => r.value === input.reason)?.value;
  if (!reason) {
    return { ok: false, field: "reason", message: "Choose a reason." };
  }
  const details = (input.details ?? "").trim();
  if (details.length > REPORT_DETAILS_MAX_LENGTH) {
    return {
      ok: false,
      field: "details",
      message: `Keep details under ${REPORT_DETAILS_MAX_LENGTH} characters.`,
    };
  }
  if (reason === "other" && details.length === 0) {
    return {
      ok: false,
      field: "details",
      message: "Tell us what the problem is.",
    };
  }
  return { ok: true, reason, details: details.length > 0 ? details : null };
}
