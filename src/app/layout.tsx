import type { ReactNode } from "react";
import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Header from "./_components/Header";

export const metadata: Metadata = {
  title: "AUReviews",
  description:
    "Auburn CSSE course reviews — walking skeleton. Not affiliated with Auburn University.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        <SessionProvider>
          <Header />
          {children}
        </SessionProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
