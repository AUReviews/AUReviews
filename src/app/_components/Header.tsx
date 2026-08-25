import Link from "next/link";
import AddReviewButton from "./AddReviewButton";
import AuthNav from "./AuthNav";
import ThemeToggle from "./ThemeToggle";

// Shared header shell (issue #19/#20/#40, v1-spec §13). Deliberately a Server
// Component that does NOT read the session, which keeps the shared layout free
// of cookies() so the landing/browse/course pages stay CDN-static (§8). The
// per-user pieces hydrate inside client islands: sign-in state in <AuthNav/>,
// and the pathname-aware "+ Add Review" link in <AddReviewButton/>.
// The theme toggle is a third island; it reads localStorage after mount.
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
        <ThemeToggle />
        <AddReviewButton />
        <AuthNav />
      </div>
    </header>
  );
}
