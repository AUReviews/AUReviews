import Link from "next/link";
import { LEGAL_LINKS, NON_AFFILIATION_DISCLAIMER } from "@/lib/legal";

// The site-wide footer (v1-spec §10/§13; issue #29): the full non-affiliation
// disclaimer on every page plus links to the legal pages. A Server Component
// with no session read, so the static pages stay CDN-static (§8).
export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <nav className="footer-links" aria-label="Legal">
        {LEGAL_LINKS.map((link) => (
          <Link key={link.key} href={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>
      <p className="footer-disclaimer">{NON_AFFILIATION_DISCLAIMER}</p>
    </footer>
  );
}
