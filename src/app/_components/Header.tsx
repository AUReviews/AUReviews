import Link from "next/link";
import AuthNav from "./AuthNav";

// Static header shell (issue #19, v1-spec §13). Deliberately a Server Component
// that does NOT read the session — that keeps the shared layout free of
// cookies() so ISR pages stay CDN-static (v1-spec §8). The per-user sign-in
// state hydrates inside <AuthNav/>, a client island.
export default function Header() {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.75rem 1.5rem",
        borderBottom: "1px solid #eee",
        fontSize: "0.9rem",
      }}
    >
      <Link
        href="/"
        style={{ fontWeight: 600, color: "#111", textDecoration: "none" }}
      >
        AUReviews
      </Link>
      <AuthNav />
    </header>
  );
}
