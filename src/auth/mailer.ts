/**
 * Magic-link delivery (v1-spec §7/§8).
 *
 * Production sends via Resend from the dedicated sending subdomain (SPF/DKIM/
 * DMARC are a DNS launch-checklist item, not code — v1-spec §7). When
 * `RESEND_API_KEY` is absent (local dev, tests), we fall back to logging the link
 * to the server console so the whole verify flow is exercisable without a key or
 * a real mailbox. The copy says "verified Auburn student," never "current
 * student" — alumni can review (v1-spec §7).
 */
import { Resend } from "resend";

function subject(): string {
  return "Your AUReviews sign-in link";
}

function textBody(url: string): string {
  return [
    "Sign in to AUReviews as a verified Auburn student.",
    "",
    "Click the link below to finish signing in. It is single-use and expires soon:",
    url,
    "",
    "If you didn't request this, you can ignore this email — no account is created until the link is used.",
    "",
    "AUReviews is an independent, student-run website. It is not affiliated with, endorsed by, or connected to Auburn University.",
  ].join("\n");
}

function htmlBody(url: string): string {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;color:#111">
  <h2 style="margin:0 0 .5rem">Sign in to AUReviews</h2>
  <p>Sign in as a <strong>verified Auburn student</strong>. This link is single-use and expires soon.</p>
  <p><a href="${url}" style="display:inline-block;padding:.6rem 1rem;background:#0a7;color:#fff;border-radius:6px;text-decoration:none">Finish signing in</a></p>
  <p style="font-size:.85rem;color:#555">Or paste this URL into your browser:<br>${url}</p>
  <p style="font-size:.75rem;color:#888;margin-top:2rem">If you didn't request this, ignore this email — no account is created until the link is used.<br>
  AUReviews is an independent, student-run website. It is not affiliated with, endorsed by, or connected to Auburn University.</p>
</div>`;
}

/**
 * Send the magic link to `to`, or log it in dev when no Resend key is
 * configured. `from` should be an address on the dedicated sending subdomain.
 */
export async function sendMagicLinkEmail(params: {
  to: string;
  url: string;
  from: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    // A magic link is a live, single-use credential — never write one to logs in
    // production. Missing the key there is a misconfiguration, not a fallback.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "RESEND_API_KEY is not set in production — refusing to log a live magic link.",
      );
    }
    // Dev/test only: no external send, but the link is usable from the console.
    console.info(
      `[auth] RESEND_API_KEY not set — magic link for ${params.to}:\n${params.url}`,
    );
    return;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: params.from,
    to: params.to,
    subject: subject(),
    text: textBody(params.url),
    html: htmlBody(params.url),
  });

  if (error) {
    throw new Error(`Resend failed to send magic link: ${error.message}`);
  }
}
