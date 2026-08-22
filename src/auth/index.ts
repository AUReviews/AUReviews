/**
 * Auth.js (NextAuth) wiring for AUReviews (issue #19, v1-spec §7; issue #43).
 *
 * Sign-in is a typed 6-digit code, not a magic link (issue #43): the emailed
 * message contains no URL for Microsoft 365 Safe Links to rewrite or pre-fetch,
 * and the code works cross-device. The code IS the verification token
 * (`generateVerificationToken`), so the stock email-provider flow — secret-
 * hashed storage, single use, expiry — applies to it unchanged. The EXCHANGE
 * of a typed code for a session does not go through the provider's callback
 * route: it runs in-process via ./exchange.ts (issue #47, ADR 0003) so the
 * review form can post and sign in inside one server action with no
 * navigation. The route still exists; our UI just doesn't post to it.
 *
 * The anonymity guarantees are enforced here across three seams:
 *   1. `signIn` callback rejects any non-Auburn address BEFORE a token is created
 *      or an email sent (AC #1).
 *   2. `sendVerificationRequest` re-asserts the domain and delivers the code. The
 *      send RATE limits (AC #5) are enforced upstream in the sign-in server
 *      action (see src/app/signin/actions.ts) — before `signIn` runs, so a
 *      throttled request never reaches token rotation and can't invalidate a
 *      victim's live code (v1-spec §7: "one live verification token per address").
 *   3. `session` callback strips the user object to nothing identifying — the
 *      client never receives `identity_hash`, the raw address, or even the
 *      internal user id (AC #4). Server code resolves the session to
 *      `identity_hash` via ./session.ts instead.
 *
 * The custom adapter (./adapter.ts) persists only `identity_hash`, never the
 * email (AC #3) — including in `verification_tokens`, whose identifier is the
 * same peppered hash. The pepper lives in env, never the DB (AC #4).
 */
import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { isAuburnStudentEmail, normalizeEmail } from "@/domain";
import { createHashingAdapter } from "./adapter";
import { generateSignInCode } from "./code";
import { fromAddress, sendSignInCodeEmail } from "./mailer";

/** A typed code is used the moment it is read — 10 minutes is ample, and a
 * shorter life further shrinks the guessing window (issue #43 triage). */
const TOKEN_MAX_AGE_SECONDS = 10 * 60;


export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: createHashingAdapter(),
  // Opaque server-mapped session cookie; the client never sees identity_hash.
  session: { strategy: "database" },
  pages: {
    signIn: "/signin",
    // The requester is redirected to the sent state explicitly by the sign-in
    // server action; this is the fallback for direct hits on the auth route.
    verifyRequest: "/signin",
    error: "/signin",
  },
  providers: [
    Resend({
      from: fromAddress(),
      maxAge: TOKEN_MAX_AGE_SECONDS,
      // The token the user exchanges is the typed 6-digit code (issue #43).
      generateVerificationToken: generateSignInCode,
      // Normalize so the same person always maps to the same token identifier
      // and, downstream, the same identity_hash.
      normalizeIdentifier: normalizeEmail,
      async sendVerificationRequest({ identifier, token }) {
        // Defense in depth: the signIn callback already rejected non-Auburn
        // addresses, but never deliver to one even on an unexpected code path.
        if (!isAuburnStudentEmail(identifier)) {
          throw new Error("Refusing to send to a non-Auburn address.");
        }
        await sendSignInCodeEmail({ to: identifier, code: token, from: fromAddress() });
      },
    }),
  ],
  callbacks: {
    // AC #1: reject a non-Auburn address at the verification-request phase —
    // before a token is created or an email sent. On the second phase (after the
    // user submits the code) `verificationRequest` is absent and the adapter user
    // carries no email; by then Auburn control is already proven, so allow it.
    signIn({ user, email }) {
      if (email?.verificationRequest) {
        return isAuburnStudentEmail(user.email ?? "");
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
