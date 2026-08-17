import { SignInForm } from "./signin-form";

// Per-user auth surface — always dynamic, never cached (v1-spec §8).
export const dynamic = "force-dynamic";

// The standalone sign-in page (issues #43/#47): request a 6-digit code and
// type it back, all on one screen, for people who want to sign in before
// doing anything else (voting, editing). Posting a review does NOT require a
// visit here — the review form carries the same fields inline. The auth
// routes redirect here on failure with ?error=..., which the form maps to copy.
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; provider?: string }>;
}) {
  // `provider` is appended by the Auth.js verify-request redirect (the
  // fallback path for direct hits on the auth routes) — its presence means a
  // code was just sent, so the page opens in the sent state.
  const { error, provider } = await searchParams;

  return (
    <main className="signin">
      <div className="signin-card">
        <h1>Sign in</h1>
        <p className="lede">
          AUReviews is for <strong>verified Auburn students</strong>. Enter your
          Auburn email and we&apos;ll send a single-use 6-digit code — then type
          it below to finish signing in.
        </p>

        <SignInForm initialErrorCode={error ?? null} initialSent={Boolean(provider)} />

        <p className="signin-foot">
          We never store your email address — only a non-reversible token derived
          from it. Alumni with an Auburn mailbox can sign in too.
        </p>
      </div>
    </main>
  );
}
