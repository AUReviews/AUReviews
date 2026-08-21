/**
 * Reader-flagging rules (v1-spec §11/§12; issue #27) — the pure core behind
 * the two distinct moderation surfaces:
 *
 *   1. **"Report this review"** — per-review, post-publish (§11.B). A reader
 *      picks one of the guideline categories below and optionally says more.
 *   2. **"Report a concern"** — site-wide and UNGATED (§11): bug reports,
 *      informal removal requests, and anything not tied to one review.
 *
 * Both are pull-based: the operator acts only when something arrives (§11.B
 * "never proactively scans"). Every option offered here is deliberately
 * neutral and descriptive — the site must never supply an accusatory prompt
 * (§10, the *Roommates.com* material-contribution line); any substantive claim
 * originates in the reader's free text.
 *
 * Like `review.ts`, this reads no env, DB, or request: the server actions call
 * these validators as the authoritative gate and the forms reuse them live.
 */

/** The §11 "prohibited (takedown-eligible)" categories, as report reasons. */
export const REPORT_REASONS = [
  { value: "off-topic", label: "Wrong course or off-topic" },
  { value: "identifying-info", label: "Contains identifying or contact info" },
  { value: "misconduct-accusation", label: "Accuses someone of misconduct" },
  { value: "protected-characteristic", label: "Remarks on protected characteristics or appearance" },
  { value: "not-about-course", label: "About a TA or another student, not the course" },
  { value: "profanity", label: "Profanity" },
  { value: "spam", label: "Spam, impersonation, or self-review" },
  { value: "other", label: "Something else" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

/** Free-text cap on the optional "tell us more" field. */
export const REPORT_DETAILS_MAX_LENGTH = 1000;

/** What a concern is about (§11): a bug, an informal removal request, or other. */
export const CONCERN_KINDS = [
  { value: "bug", label: "Bug or broken page" },
  { value: "removal", label: "Request to remove content" },
  { value: "other", label: "Something else" },
] as const;

export type ConcernKind = (typeof CONCERN_KINDS)[number]["value"];

export const CONCERN_MESSAGE_MAX_LENGTH = 4000;
export const CONCERN_CONTACT_MAX_LENGTH = 254;
export const CONCERN_PAGE_URL_MAX_LENGTH = 500;

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

export type ConcernResult =
  | {
      ok: true;
      kind: ConcernKind;
      message: string;
      contactEmail: string | null;
      pageUrl: string | null;
    }
  | { ok: false; field: "kind" | "message" | "contactEmail"; message: string };

// Loose shape check only: the address is a reply-to convenience, not an
// identity claim, so there is no domain gate here (§11: ungated).
const LOOSE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate a "Report a concern" submission. No sign-in, no `@auburn.edu`
 * requirement (§11). The contact address is optional and only used so the
 * operator can reply; a page URL is kept only if it is a plain http(s) link.
 */
export function validateConcern(input: {
  kind: string | null;
  message: string | null;
  contactEmail: string | null;
  pageUrl: string | null;
}): ConcernResult {
  const kind = CONCERN_KINDS.find((k) => k.value === input.kind)?.value;
  if (!kind) {
    return { ok: false, field: "kind", message: "Choose what this is about." };
  }
  const message = (input.message ?? "").trim();
  if (message.length === 0) {
    return { ok: false, field: "message", message: "Describe the concern." };
  }
  if (message.length > CONCERN_MESSAGE_MAX_LENGTH) {
    return {
      ok: false,
      field: "message",
      message: `Keep the message under ${CONCERN_MESSAGE_MAX_LENGTH} characters.`,
    };
  }
  const contact = (input.contactEmail ?? "").trim();
  if (contact.length > 0 && (contact.length > CONCERN_CONTACT_MAX_LENGTH || !LOOSE_EMAIL_RE.test(contact))) {
    return {
      ok: false,
      field: "contactEmail",
      message: "Enter a valid email address, or leave it blank.",
    };
  }
  const pageUrl = sanitizePageUrl(input.pageUrl);
  return {
    ok: true,
    kind,
    message,
    contactEmail: contact.length > 0 ? contact : null,
    pageUrl,
  };
}

function sanitizePageUrl(raw: string | null): string | null {
  const value = (raw ?? "").trim();
  if (value.length === 0 || value.length > CONCERN_PAGE_URL_MAX_LENGTH) return null;
  return /^https?:\/\//i.test(value) ? value : null;
}
