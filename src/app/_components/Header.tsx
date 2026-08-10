import Link from "next/link";
import AuthNav from "./AuthNav";

// Shared header shell (issue #19/#20, v1-spec §13). Deliberately a Server
// Component that does NOT read the session — that keeps the shared layout free
// of cookies() so the landing/browse/course pages stay CDN-static (§8). The
// per-user sign-in state hydrates inside <AuthNav/>, a client island.
//
// The theme toggle and "+ Add Review" button from prototype/index.html belong
// to later tickets (the review-form/theme work, §13); the header carries only
// the brand, the Courses entry into browse, and the auth entry point for now.
export default function Header() {
  return (
    <header className="hdr">
      <div className="hdr-left">
        <Link href="/" className="brand">
          <span className="brand-logo">A</span>
          <span className="brand-name">AUReviews</span>
        </Link>
        <Link href="/courses" className="nav-link">
          Courses
        </Link>
      </div>
      <div className="hdr-right">
        <AuthNav />
      </div>
    </header>
  );
}
