import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { clientIpFromHeaders } from "@/auth/client-ip";
import { getPepper } from "@/auth/pepper";
import { checkAndRecordSend } from "@/auth/rate-limit";
import { computeIdentityHash, isAuburnAffiliateEmail } from "@/domain";

// Per-user auth surface — always dynamic, never cached (v1-spec §8).
export const dynamic = "force-dynamic";

// Server action: the sign-in form's entry point and the enforced send gate.
//   1. Domain is checked here for a friendly inline message AND again in the
//      signIn callback as the security gate (v1-spec §7) — an invalid address is
//      rejected before any email is sent.
//   2. Send rate limits (≤3/address/hr, ≤10/IP/hr, <100/day) are enforced HERE,
//      before signIn issues a token — so a throttled request never rotates an
//      existing live link.
async function requestMagicLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  if (!isAuburnAffiliateEmail(email)) {
    redirect("/signin?error=domain");
  }

  const addressHash = computeIdentityHash(getPepper(), email);
  const ip = clientIpFromHeaders(await headers());
  const decision = await checkAndRecordSend({ addressHash, ip });
  if (!decision.allowed) {
    redirect("/signin?error=rate");
  }

  await signIn("resend", { email, redirectTo: "/signin/verify" });
}

function errorMessage(code: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case "domain":
    case "AccessDenied":
      return "That address isn't an Auburn affiliate address. Use your @auburn.edu or @tigermail.auburn.edu email.";
    case "rate":
      return "Too many sign-in requests. Please wait an hour and try again.";
    case "Verification":
      return "That sign-in link is invalid or has expired. Request a new one below.";
    default:
      return "Something went wrong sending your link. Please try again in a moment.";
  }
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = errorMessage(error);

  return (
    <main style={{ maxWidth: 440, margin: "4rem auto", padding: "0 1.5rem" }}>
      <h1 style={{ marginBottom: "0.25rem" }}>Sign in</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        AUReviews is for <strong>verified Auburn affiliates</strong>. Enter your
        Auburn email and we&apos;ll send a single-use sign-in link.
      </p>

      {message && (
        <p
          role="alert"
          style={{
            margin: "1rem 0",
            padding: "0.75rem 1rem",
            background: "#fbeaea",
            color: "#b00",
            borderRadius: 6,
            fontSize: "0.9rem",
          }}
        >
          {message}
        </p>
      )}

      <form action={requestMagicLink} style={{ margin: "1.5rem 0" }}>
        <label
          htmlFor="email"
          style={{ display: "block", fontSize: "0.85rem", marginBottom: 6 }}
        >
          Auburn email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="abc1234@auburn.edu"
          style={{
            width: "100%",
            padding: "0.6rem 0.75rem",
            fontSize: "1rem",
            border: "1px solid #ccc",
            borderRadius: 6,
            boxSizing: "border-box",
          }}
        />
        <button
          type="submit"
          style={{
            marginTop: "0.75rem",
            width: "100%",
            padding: "0.65rem 1rem",
            fontSize: "1rem",
            background: "#0a7",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          Send sign-in link
        </button>
      </form>

      <p style={{ fontSize: "0.8rem", color: "#888" }}>
        We never store your email address — only a non-reversible token derived
        from it. Alumni with an Auburn mailbox can sign in too.
      </p>
    </main>
  );
}
