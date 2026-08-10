/**
 * Auth.js (NextAuth) wiring for AUReviews (issue #19, v1-spec §7).
 *
 * The anonymity guarantees are enforced here across three seams:
 *   1. `signIn` callback rejects any non-Auburn address BEFORE a token is created
 *      or an email sent (AC #1).
 *   2. `sendVerificationRequest` re-asserts the domain and delivers the link. The
 *      send RATE limits (AC #5) are enforced upstream in the sign-in server
 *      action (see src/app/signin/page.tsx) — before `signIn` runs, so a
 *      throttled request never reaches token rotation and can't invalidate a
 *      victim's live link (v1-spec §7: "one live verification token per address").
 *   3. `session` callback strips the user object to nothing identifying — the
 *      client never receives `identity_hash`, the raw address, or even the
 *      internal user id (AC #4). Server code resolves the session to
 *      `identity_hash` via ./session.ts instead.
 *
 * The custom adapter (./adapter.ts) persists only `identity_hash`, never the
 * email (AC #3). The pepper lives in env, never the DB (AC #4).
 */
import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { isAuburnAffiliateEmail, normalizeEmail } from "@/domain";
import { createHashingAdapter } from "./adapter";
import { sendMagicLinkEmail } from "./mailer";

/** Single live token, 15–60 min expiry (v1-spec §7). 30 min sits in the middle. */
const TOKEN_MAX_AGE_SECONDS = 30 * 60;

/** From-address on the dedicated sending subdomain (v1-spec §7). */
function fromAddress(): string {
  return process.env.EMAIL_FROM ?? "AUReviews <no-reply@mail.aureviews.com>";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: createHashingAdapter(),
  // Opaque server-mapped session cookie; the client never sees identity_hash.
  session: { strategy: "database" },
  pages: {
    signIn: "/signin",
    verifyRequest: "/signin/verify",
    error: "/signin",
  },
  providers: [
    Resend({
      from: fromAddress(),
      maxAge: TOKEN_MAX_AGE_SECONDS,
      // Normalize so the same person always maps to the same token identifier
      // and, downstream, the same identity_hash.
      normalizeIdentifier: normalizeEmail,
      async sendVerificationRequest({ identifier, url }) {
        // Defense in depth: the signIn callback already rejected non-Auburn
        // addresses, but never deliver to one even on an unexpected code path.
        if (!isAuburnAffiliateEmail(identifier)) {
          throw new Error("Refusing to send to a non-Auburn address.");
        }
        await sendMagicLinkEmail({ to: identifier, url, from: fromAddress() });
      },
    }),
  ],
  callbacks: {
    // AC #1: reject a non-Auburn address at the verification-request phase —
    // before a token is created or an email sent. On the second phase (after the
    // user clicks the link) `verificationRequest` is absent and the adapter user
    // carries no email; by then Auburn control is already proven, so allow it.
    signIn({ user, email }) {
      if (email?.verificationRequest) {
        return isAuburnAffiliateEmail(user.email ?? "");
      }
      return true;
    },
    // AC #4: the public session exposes nothing identifying. Presence of a
    // session means "signed in"; that is all the client is entitled to.
    session({ session }) {
      return { ...session, user: { ...session.user, email: "", name: null, image: null, id: "" } };
    },
  },
});
