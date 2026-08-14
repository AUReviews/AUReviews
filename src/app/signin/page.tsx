import { SignInForm } from "./signin-form";

// Per-user auth surface — always dynamic, never cached (v1-spec §8).
export const dynamic = "force-dynamic";

// The combined sign-in page (issue #43): request a 6-digit code and type it
// back, all on one screen. The auth routes redirect here on failure with
// ?error=..., which the form maps to copy.
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
    <main style={{ maxWidth: 440, margin: "4rem auto", padding: "0 1.5rem" }}>
      <h1 style={{ marginBottom: "0.25rem" }}>Sign in</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        AUReviews is for <strong>verified Auburn students</strong>. Enter your
        Auburn email and we&apos;ll send a single-use 6-digit code — then type
        it below to finish signing in.
      </p>

      <SignInForm initialErrorCode={error ?? null} initialSent={Boolean(provider)} />

      <p style={{ fontSize: "0.8rem", color: "#888" }}>
        We never store your email address — only a non-reversible token derived
        from it. Alumni with an Auburn mailbox can sign in too.
      </p>
    </main>
  );
}
