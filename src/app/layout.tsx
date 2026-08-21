import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Header from "./_components/Header";
import "./globals.css";

const GITHUB_REPO = "https://github.com/AUReviews/AUReviews";
const GITHUB_ISSUE_BUG = `${GITHUB_REPO}/issues/new?template=bug_report.yml`;
const GITHUB_ISSUE_FEATURE = `${GITHUB_REPO}/issues/new?template=feature_request.yml`;

// The prototype's display face (prototype/SOURCE.md), self-hosted by next/font
// so there is no external CDN request on any page.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AUReviews — Auburn CSSE Course Reviews",
  description:
    "Anonymous, verified reviews of Auburn's COMP catalog. Independent and student-run — not affiliated with Auburn University.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={jakarta.className}>
      <body>
        <div className="app">
          <SessionProvider>
            <Header />
            <main className="main">{children}</main>
          </SessionProvider>
          <footer className="site-footer">
            <p>
              AUReviews is an independent, student-run website. It is not
              affiliated with, endorsed by, or connected to Auburn University.
            </p>
            <p className="site-footer-links">
              {/* Bugs and feature requests go straight to GitHub issues (owner
                  decision on #27); flagging a specific review is the per-review
                  Report link. */}
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
          </footer>
        </div>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
