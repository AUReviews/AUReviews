import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Header from "./_components/Header";
import "./globals.css";

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
            AUReviews is an independent, student-run website. It is not affiliated
            with, endorsed by, or connected to Auburn University.
          </footer>
        </div>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
