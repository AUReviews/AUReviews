/**
 * Sign-in code delivery (v1-spec §7/§8, issue #43).
 *
 * The email carries a typed 6-digit code and deliberately NO URL of any kind:
 * Auburn mail passes through Microsoft 365, whose Safe Links rewrites and
 * sometimes pre-fetches URLs — which can consume or break a single-use magic
 * link. A code gives link scanning nothing to touch.
 *
 * Production sends via Resend from the dedicated sending subdomain (SPF/DKIM/
 * DMARC are a DNS launch-checklist item, not code — v1-spec §7). When
 * `RESEND_API_KEY` is absent (local dev, tests), we fall back to logging the
 * code to the server console so the whole verify flow is exercisable without a
 * key or a real mailbox. The copy says "verified Auburn student," never
 * "current student" — alumni can review (v1-spec §7).
 */
import { Resend } from "resend";
import { formatCodeForDisplay } from "./code";

/** Subject and bodies for the code email. Exported for content tests: the code
 * must appear grouped, and no URL may appear anywhere Safe Links could touch. */
export function buildSignInCodeEmail(code: string): {
  subject: string;
  text: string;
  html: string;
} {
  const displayCode = formatCodeForDisplay(code);
  return {
    subject: "Your AUReviews sign-in code",
    text: [
      "Sign in to AUReviews as a verified Auburn student.",
      "",
      "Enter this code where you requested it — on the review form or the sign-in page. It is single-use and expires in about 10 minutes:",
      "",
      displayCode,
      "",
      "If you didn't request this, you can ignore this email — no account is created until the code is used.",
      "",
      "AUReviews is an independent, student-run website. It is not affiliated with, endorsed by, or connected to Auburn University.",
    ].join("\n"),
    html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;color:#111">
  <h2 style="margin:0 0 .5rem">Sign in to AUReviews</h2>
  <p>Sign in as a <strong>verified Auburn student</strong>. Enter this code where you requested it &mdash; on the review form or the sign-in page. It is single-use and expires in about 10 minutes:</p>
  <p style="font-size:1.75rem;font-weight:700;letter-spacing:.25rem;margin:.5rem 0">${displayCode}</p>
  <p style="font-size:.75rem;color:#888;margin-top:2rem">If you didn't request this, ignore this email — no account is created until the code is used.<br>
  AUReviews is an independent, student-run website. It is not affiliated with, endorsed by, or connected to Auburn University.</p>
</div>`,
  };
}

/**
 * Send the sign-in code to `to`, or log it in dev when no Resend key is
 * configured. `from` should be an address on the dedicated sending subdomain.
 */
export async function sendSignInCodeEmail(params: {
  to: string;
  code: string;
  from: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    // A sign-in code is a live, single-use credential — never write one to logs
    // in production. Missing the key there is a misconfiguration, not a fallback.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "RESEND_API_KEY is not set in production — refusing to log a live sign-in code.",
      );
    }
    // Dev/test only: no external send, but the code is usable from the console.
    console.info(
      `[auth] RESEND_API_KEY not set — sign-in code for ${params.to}: ${params.code}`,
    );
    return;
  }

  const { subject, text, html } = buildSignInCodeEmail(params.code);
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: params.from,
    to: params.to,
    subject,
    text,
    html,
  });

  if (error) {
    throw new Error(`Resend failed to send sign-in code: ${error.message}`);
  }
}

/** From-address on the dedicated sending subdomain (v1-spec §7). Shared by
 * the sign-in code and the operator notifications (src/lib/operator-mail.ts). */
export function fromAddress(): string {
  return process.env.EMAIL_FROM ?? "AUReviews <no-reply@mail.aureviews.com>";
}
