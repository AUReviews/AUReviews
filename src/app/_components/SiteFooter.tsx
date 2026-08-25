import Link from "next/link";
import { LEGAL_LINKS, NON_AFFILIATION_DISCLAIMER } from "@/lib/legal";

const GITHUB_REPO = "https://github.com/AUReviews/AUReviews";
const GITHUB_ISSUE_BUG = `${GITHUB_REPO}/issues/new?template=bug_report.yml`;
const GITHUB_ISSUE_FEATURE = `${GITHUB_REPO}/issues/new?template=feature_request.yml`;

// The site-wide footer (v1-spec §10/§13; issue #29). Two bands: the
// GitHub links with the non-affiliation disclaimer beneath them (bugs and feature requests
// go straight to issues, owner decision on #27), then a compact legal bar
// with the copyright and the ToS/Privacy/Guidelines links. A Server Component
// with no session read, so the static pages stay CDN-static (§8).
export default function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <p className="site-footer-links">
          <a href={GITHUB_ISSUE_BUG} target="_blank" rel="noopener noreferrer">
            Report a bug
          </a>
          <a href={GITHUB_ISSUE_FEATURE} target="_blank" rel="noopener noreferrer">
            Request a feature
          </a>
          <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
        </p>
        <p className="footer-disclaimer">{NON_AFFILIATION_DISCLAIMER}</p>
      </div>
      <nav className="footer-legal" aria-label="Legal">
        <span>&copy; {year} AUReviews</span>
        {LEGAL_LINKS.map((link) => (
          <Link key={link.key} href={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
