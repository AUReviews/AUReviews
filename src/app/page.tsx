import Link from "next/link";
import { unstable_cache } from "next/cache";
import { getCourseCount } from "@/db/queries";

// Landing page (issue #20, v1-spec §13). Marketing + the single entry point into
// browse. v1 has NO search box — the click-to-sort catalog table is the entire
// discovery surface (§5) — so the prototype's hero search input is replaced by a
// plain "Browse all courses" CTA.
//
// ISR: CDN-static with a time-based fallback, refreshable on demand via
// POST /api/revalidate { "tag": "catalog" } after an import (§8).
export const revalidate = 3600;

// The course count is read behind the "catalog" cache tag so a catalog import
// (#18) can refresh this line without waiting out the revalidate window. Only a
// successful read is cached — the try/catch stays OUTSIDE the cache so a
// transient DB error isn't frozen in as `null` for the whole window.
const loadCourseCount = unstable_cache(
  async (): Promise<number> => getCourseCount(),
  ["landing-course-count"],
  { tags: ["catalog"] },
);

export default async function Home() {
  let courseCount: number | null = null;
  try {
    // Landing must render even before Neon is provisioned; on error the hero
    // simply drops its count line rather than erroring the whole page.
    courseCount = await loadCourseCount();
  } catch {
    courseCount = null;
  }

  return (
    <div className="landing">
      <div className="hero">
        <span className="eyebrow">AUBURN CSSE COURSE REVIEWS</span>
        <h1 className="hero-h1">Know the course before you register</h1>
        <p className="hero-sub">
          Anonymous reviews from verified Auburn students who&rsquo;ve taken
          it — overall, difficulty, and real weekly workload, side by side.
          {courseCount !== null && courseCount > 0
            ? ` Browse all ${courseCount.toLocaleString()} COMP courses.`
            : " Browse the full COMP catalog."}
        </p>
        <Link href="/courses" className="btn-accent hero-cta">
          Browse all courses →
        </Link>
      </div>
    </div>
  );
}
