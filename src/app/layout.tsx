import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Header from "./_components/Header";
import SiteFooter from "./_components/SiteFooter";
import "./globals.css";

// The prototype's display face (prototype/SOURCE.md), self-hosted by next/font
// so there is no external CDN request on any page.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AUReviews: Auburn CSSE Course Reviews",
  description:
    "Anonymous, verified reviews of Auburn's COMP catalog. Independent and student-run, not affiliated with Auburn University.",
};

// Applies the viewer's stored theme choice before first paint (see
// ThemeToggle.tsx). Runs inline so there is no flash; it touches only <html>'s
// data-theme attribute, hence suppressHydrationWarning there.
const THEME_INIT =
  '(function(){try{var t=localStorage.getItem("aureviews-theme");' +
  'if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})();';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={jakarta.className} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>
        <div className="app">
          <SessionProvider>
            <Header />
            <main className="main">{children}</main>
          </SessionProvider>
          <SiteFooter />
        </div>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
