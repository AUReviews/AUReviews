import Link from "next/link";

export const dynamic = "force-dynamic";

// Shown after a link is requested (Auth.js `verifyRequest` page). We can't name
// the address here — it was never persisted for us to read back (v1-spec §7).
export default function VerifyRequestPage() {
  return (
    <main style={{ maxWidth: 440, margin: "4rem auto", padding: "0 1.5rem" }}>
      <h1 style={{ marginBottom: "0.25rem" }}>Check your email</h1>
      <p style={{ color: "#444" }}>
        If that address is a valid Auburn student address, a single-use sign-in
        link is on its way. It expires in about 30 minutes.
      </p>
      <p style={{ fontSize: "0.85rem", color: "#888", marginTop: "1.5rem" }}>
        Auburn mail is filtered by Microsoft 365 — if you don&apos;t see it,
        check your Junk folder. You can request another link from the{" "}
        <Link href="/signin">sign-in page</Link>.
      </p>
    </main>
  );
}
