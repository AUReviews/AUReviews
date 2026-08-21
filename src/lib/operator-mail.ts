/**
 * Operator notifications (v1-spec §12 "email-routed inboxes"; issue #27).
 *
 * The operator has no console to poll in v1 (§12): every "Report this review"
 * and "Report a concern" submission writes a row AND pushes an email through
 * the same Resend integration the sign-in code uses (§7/§8). The row is the
 * record; the email is the notification. A delivery failure must therefore
 * never fail the reader's submission — `sendOperatorEmail` logs and returns.
 *
 * Unlike the sign-in code email, these carry a URL: the operator inbox is not
 * an Auburn/Microsoft 365 mailbox, so the Safe Links concern in
 * src/auth/mailer.ts does not apply, and the link is the whole point (§12).
 *
 * Reader-supplied text is HTML-escaped before it reaches the html body: these
 * emails are read in a mail client, and a report is exactly where a hostile
 * payload would be planted.
 */
import { Resend } from "resend";
import { fromAddress } from "@/auth/mailer";
import {
  CONCERN_KINDS,
  type ConcernKind,
  REPORT_REASONS,
  type ReportReason,
} from "@/domain";

export interface OperatorEmail {
  subject: string;
  text: string;
  html: string;
}

const NO_CONTACT = "No contact address was given.";

/** The "Report this review" notification: review id + link first (§12). */
export function buildReviewReportEmail(input: {
  reviewId: string;
  reviewUrl: string;
  courseCode: string;
  reason: ReportReason;
  details: string | null;
  reportedBySignedIn: boolean;
}): OperatorEmail {
  const reasonLabel =
    REPORT_REASONS.find((r) => r.value === input.reason)?.label ?? input.reason;
  const reporter = input.reportedBySignedIn
    ? "Reported by a signed-in Auburn student."
    : "Reported by a signed-out visitor.";
  const details = input.details ?? "(no details given)";
  return {
    subject: `[AUReviews] Review reported — ${input.courseCode}: ${reasonLabel}`,
    text: [
      `A reader reported a review on ${input.courseCode}.`,
      "",
      `Review id: ${input.reviewId}`,
      `Link: ${input.reviewUrl}`,
      `Reason: ${reasonLabel}`,
      `Details: ${details}`,
      "",
      reporter,
      "",
      "Judge it against the published guidelines; takedowns run via runbook/takedown.sql (v1-spec §12).",
    ].join("\n"),
    html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;color:#111">
  <h2 style="margin:0 0 .5rem">Review reported — ${esc(input.courseCode)}</h2>
  <p><strong>Review id:</strong> <code>${esc(input.reviewId)}</code><br>
  <strong>Link:</strong> <a href="${esc(input.reviewUrl)}">${esc(input.reviewUrl)}</a><br>
  <strong>Reason:</strong> ${esc(reasonLabel)}</p>
  <p><strong>Details:</strong><br>${esc(details).replace(/\n/g, "<br>")}</p>
  <p style="font-size:.8rem;color:#666">${esc(reporter)} Judge it against the published guidelines; takedowns run via <code>runbook/takedown.sql</code>.</p>
</div>`,
  };
}

/** The "Report a concern" notification (§11/§12): kind, message, reply-to. */
export function buildConcernEmail(input: {
  concernId: string;
  kind: ConcernKind;
  message: string;
  contactEmail: string | null;
  pageUrl: string | null;
}): OperatorEmail {
  const kindLabel =
    CONCERN_KINDS.find((k) => k.value === input.kind)?.label ?? input.kind;
  const contact = input.contactEmail
    ? `Reply to: ${input.contactEmail}`
    : NO_CONTACT;
  const page = input.pageUrl ? `Page: ${input.pageUrl}` : "Page: (not given)";
  return {
    subject: `[AUReviews] Concern — ${kindLabel}`,
    text: [
      "Someone sent a concern through the site-wide form (no sign-in required).",
      "",
      `Concern id: ${input.concernId}`,
      `Kind: ${kindLabel}`,
      page,
      contact,
      "",
      "Message:",
      input.message,
    ].join("\n"),
    html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;color:#111">
  <h2 style="margin:0 0 .5rem">Concern — ${esc(kindLabel)}</h2>
  <p><strong>Concern id:</strong> <code>${esc(input.concernId)}</code><br>
  <strong>${esc(page)}</strong><br>
  ${esc(contact)}</p>
  <p style="white-space:pre-wrap;border-left:3px solid #ccc;padding-left:.75rem">${esc(input.message)}</p>
</div>`,
  };
}

/** Where operator notifications go; `null` when unconfigured. */
export function operatorEmailAddress(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const value = env.OPERATOR_EMAIL?.trim();
  return value ? value : null;
}

/**
 * Deliver an operator notification. Never throws: the DB row already exists
 * by the time this is called, and a Resend outage must not turn into a
 * reader-facing error. Without a Resend key (dev/tests) the email is logged;
 * without an operator address it is logged with a warning so a production
 * misconfiguration is visible in the function logs.
 */
export async function sendOperatorEmail(email: OperatorEmail): Promise<void> {
  const to = operatorEmailAddress();
  const apiKey = process.env.RESEND_API_KEY;

  if (!to) {
    console.warn(
      `[moderation] OPERATOR_EMAIL not set — notification not delivered: ${email.subject}`,
    );
    return;
  }
  if (!apiKey) {
    console.info(
      `[moderation] RESEND_API_KEY not set — would email ${to}: ${email.subject}\n${email.text}`,
    );
    return;
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: fromAddress(),
      to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
    if (error) {
      console.error(`[moderation] Resend failed: ${error.message} — ${email.subject}`);
    }
  } catch (err) {
    console.error(`[moderation] Resend threw — ${email.subject}`, err);
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
