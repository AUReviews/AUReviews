"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";

// Per-user sign-in entry point, resolved on the CLIENT (v1-spec §8): keeping the
// session read out of the server render means the shared layout never calls
// cookies(), so the catalog/browse/course pages stay CDN-static. The session
// carries nothing identifying (v1-spec §7) — we branch only on signed-in state.
export default function AuthNav() {
  const { status } = useSession();

  if (status === "authenticated") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.75rem" }}>
        <span style={{ color: "#0a7" }}>Verified Auburn student</span>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/" })}
          style={{
            padding: "0.35rem 0.75rem",
            border: "1px solid #ccc",
            borderRadius: 6,
            background: "#fff",
            cursor: "pointer",
            fontSize: "0.85rem",
          }}
        >
          Sign out
        </button>
      </span>
    );
  }

  return (
    <Link
      href="/signin"
      style={{
        padding: "0.35rem 0.75rem",
        border: "1px solid #0a7",
        borderRadius: 6,
        color: "#0a7",
        textDecoration: "none",
      }}
    >
      Sign in
    </Link>
  );
}
