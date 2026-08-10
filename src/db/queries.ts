import { and, desc, eq, sql } from "drizzle-orm";
import type { PlaceholderRow } from "@/domain";
import type { BrowseCourse } from "@/lib/browse";
import type { CourseDetail } from "@/lib/course-detail";
import { getDb } from "./client";
import { courses, placeholder } from "./schema";

/**
 * Read the newest placeholder row — the skeleton's DB proof-of-life. Returns
 * `null` when the table is empty (migrated but not yet seeded), which the page
 * renders as a "run the seed" state rather than an error.
 */
export async function getLatestPlaceholder(): Promise<PlaceholderRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(placeholder)
    .orderBy(desc(placeholder.createdAt))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return { id: row.id, message: row.message, createdAt: row.createdAt };
}

/**
 * Load the whole COMP catalog for the browse/index table (issue #20). Rows are
 * returned UNSORTED; catalog order (and every other column order) is imposed by
 * the pure `sortBrowseCourses` comparator, which is the single source of truth
 * for ordering — the server renders the default sort and the client re-sorts the
 * same rows with the same comparator, so no ordering rule is duplicated in SQL.
 *
 * The three averages are hard-`null` and `reviewCount` is 0 here on purpose: no
 * review table exists yet (#6). This is the single seam where those columns get
 * wired — when reviews land, this becomes a LEFT JOIN + aggregate over §4's
 * rolling window, and the page above it does not change (it already renders
 * "—"/true-N for null averages). Retired courses are included, not filtered —
 * the table de-emphasizes them (issue #20) rather than hiding them.
 */
export async function listCourses(): Promise<BrowseCourse[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: courses.id,
      subject: courses.subject,
      number: courses.number,
      title: courses.title,
      status: courses.status,
    })
    .from(courses);

  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    number: r.number,
    title: r.title,
    status: r.status === "retired" ? "retired" : "active",
    overall: null,
    difficulty: null,
    workload: null,
    reviewCount: 0,
  }));
}

/**
 * Load one course's full catalog record for its detail page (issue #21), keyed
 * on the CURRENT catalog code `(subject, number)` the URL carries — subject is
 * matched case-insensitively so a `comp-3270` slug resolves the stored `COMP`
 * row. Returns `null` when no course matches, which the route renders as a 404.
 *
 * The three averages are hard-`null` and `reviewCount` is 0 here on purpose,
 * exactly as {@link listCourses}: no review table exists yet (#6). This is the
 * single seam where those columns get wired — when reviews land, this becomes a
 * LEFT JOIN + aggregate over §4's rolling window, and the page above it does not
 * change (it already renders the N = 0 "write the first review" state).
 */
export async function getCourseByCode(
  subject: string,
  number: string,
): Promise<CourseDetail | null> {
  const db = getDb();
  const rows = await db
    .select({
      id: courses.id,
      subject: courses.subject,
      number: courses.number,
      title: courses.title,
      description: courses.description,
      creditHours: courses.creditHours,
      prereqText: courses.prereqText,
      catalogYear: courses.catalogYear,
      status: courses.status,
    })
    .from(courses)
    .where(
      and(
        sql`upper(${courses.subject}) = ${subject.toUpperCase()}`,
        eq(courses.number, number),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    subject: row.subject,
    number: row.number,
    title: row.title,
    description: row.description,
    creditHours: row.creditHours,
    prereqText: row.prereqText,
    catalogYear: row.catalogYear,
    status: row.status === "retired" ? "retired" : "active",
    overall: null,
    difficulty: null,
    workload: null,
    reviewCount: 0,
  };
}

/** Count the catalog for the landing page's honest "N courses" line (#20). */
export async function getCourseCount(): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(courses);
  return rows[0]?.count ?? 0;
}
