import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { listCourses } from "@/db/queries";
import { type BrowseCourse, DEFAULT_SORT, sortBrowseCourses } from "@/lib/browse";
import CourseTable from "./CourseTable";

// Browse/index page (issue #20, v1-spec §5/§13) — v1's entire discovery surface.
// The catalog table stands alone with zero reviews: rating columns read "—" and
// the true N, and the page reads identically whether empty or full.
//
// ISR: CDN-static with a time-based fallback, refreshable on demand via
// POST /api/revalidate { "tag": "catalog" } after an import (§8).
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "All courses — AUReviews",
  description:
    "Browse Auburn's COMP catalog. Sort by overall rating, difficulty, workload, or review count.",
};

// The catalog read sits behind the "catalog" cache tag so an import (#18) can
// refresh every browse render on demand without waiting out the window.
const loadCourses = unstable_cache(
  async (): Promise<BrowseCourse[]> => listCourses(),
  ["browse-courses"],
  { tags: ["catalog"] },
);

type PageState =
  | { kind: "ok"; courses: BrowseCourse[] }
  | { kind: "empty" }
  | { kind: "error"; message: string };

async function loadState(): Promise<PageState> {
  try {
    const courses = await loadCourses();
    if (courses.length === 0) return { kind: "empty" };
    // Render the default (catalog) order server-side so the static/ISR HTML is
    // already sorted; the client mounts in the same DEFAULT_SORT state, so its
    // first render matches and there is no reshuffle on hydration.
    const ordered = sortBrowseCourses(courses, DEFAULT_SORT.key, DEFAULT_SORT.direction);
    return { kind: "ok", courses: ordered };
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export default async function CoursesPage() {
  const state = await loadState();

  return (
    <div className="list">
      <div className="list-head">
        <h1>All courses</h1>
        {state.kind === "ok" && (
          <span className="list-count">
            {state.courses.length.toLocaleString()}{" "}
            {state.courses.length === 1 ? "course" : "courses"}
          </span>
        )}
      </div>

      {state.kind === "ok" && <CourseTable courses={state.courses} />}

      {state.kind === "empty" && (
        <div className="empty-state">
          No courses yet. Run <code>npm run ingest</code> to import the COMP
          catalog from the Auburn bulletin.
        </div>
      )}

      {state.kind === "error" && (
        <div className="error-state">
          <p>
            Could not load the catalog. This is expected until Neon is
            provisioned and migrations have run (see <code>docs/deploy.md</code>).
          </p>
          <pre>{state.message}</pre>
        </div>
      )}
    </div>
  );
}
