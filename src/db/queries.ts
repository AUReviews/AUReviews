import { and, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import {
  type InstructorUnknown,
  type PlaceholderRow,
  type VoteDirection,
  canEditReview,
  gateAverages,
} from "@/domain";
import type { BrowseCourse } from "@/lib/browse";
import type { CourseDetail } from "@/lib/course-detail";
import type { CourseReview, InstructorStats } from "@/lib/course-reviews";
import { type CourseSearchRow, escapeLikePattern } from "@/lib/course-search";
import { type MyReview, type MyVote, type OwnReview, excerpt } from "@/lib/my-activity";
import type { PrereqCatalogRow } from "@/lib/prereqs";
import { getDb } from "./client";
import {
  courses,
  instructors,
  offeringInstructors,
  offerings,
  placeholder,
  reviewReports,
  reviewVotes,
  reviews,
} from "./schema";

/** Only `published` reviews ever reach an aggregate or a page; `pending`,
 * `removed`, and `deleted` rows drop out of everything immediately (§11). */
const publishedReviews = () => eq(reviews.status, "published");

/** Tally of joined `review_votes` rows in one direction (issue #25). With a
 * LEFT JOIN and no votes, the filter counts nothing — an honest zero. */
const voteTally = (direction: VoteDirection) =>
  sql<number>`count(*) filter (where ${reviewVotes.direction} = ${direction})::int`;

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
 * The rating columns aggregate each course's published reviews in SQL — plain
 * arithmetic means (§5), computed at revalidation time — then pass §5's low-data
 * gate: below its threshold the averages are `null`ed so the row renders "—" (and sinks
 * under a rating sort) while `reviewCount` stays the true N. The submission
 * window (§4) gates what can be *submitted*, never what is counted — every
 * published review is in the aggregate, with no recency decay (§5). Retired
 * courses are included, not filtered — the table de-emphasizes them (issue #20)
 * rather than hiding them.
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
      reviewCount: sql<number>`count(${reviews.id})::int`,
      overall: sql<number | null>`avg(${reviews.overall})::float8`,
      difficulty: sql<number | null>`avg(${reviews.difficulty})::float8`,
      workload: sql<number | null>`avg(${reviews.workloadHours})::float8`,
    })
    .from(courses)
    .leftJoin(
      reviews,
      and(eq(reviews.courseId, courses.id), publishedReviews()),
    )
    .groupBy(courses.id);

  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    number: r.number,
    title: r.title,
    status: r.status === "retired" ? "retired" : "active",
    ...gateAverages(r, r.reviewCount),
    reviewCount: r.reviewCount,
  }));
}

/**
 * Load one course's full catalog record for its detail page (issue #21), keyed
 * on the CURRENT catalog code `(subject, number)` the URL carries — subject is
 * matched case-insensitively so a `comp-3270` slug resolves the stored `COMP`
 * row. Returns `null` when no course matches, which the route renders as a 404.
 *
 * The three averages stay hard-`null` and `reviewCount` 0 HERE deliberately:
 * this catalog read sits behind the long-lived "catalog" cache tag, while the
 * live aggregates must refresh on every review write. The course page overlays
 * {@link getCourseAggregates} (fresh each revalidation) on this record, and the
 * submit action only needs the durable id — so neither consumer reads these
 * placeholder columns.
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

/**
 * Load every course's code, title, status, and verbatim prereq prose for the
 * Prerequisites/Unlocks graph (issue #22). The course page derives BOTH
 * directions from this one snapshot via `buildCoursePrereqView` — a course's own
 * prerequisites AND its inverse "Unlocks" (the courses that require it) — so the
 * two can never disagree (§6). The whole COMP catalog is small, and the read is
 * cached behind the course page's `catalog` ISR tag, so loading all rows to
 * compute one course's graph is cheap. `prereqText` is the same verbatim prose
 * the parser structures; a null is a course with no listed prerequisites.
 * Retired courses are included, not filtered — they keep their pages, so they
 * stay valid Unlocks targets (matching {@link listCourses}).
 */
export async function listPrereqRows(): Promise<PrereqCatalogRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      subject: courses.subject,
      number: courses.number,
      title: courses.title,
      prereqText: courses.prereqText,
    })
    .from(courses);

  return rows.map((r) => ({
    subject: r.subject,
    number: r.number,
    title: r.title,
    prereqText: r.prereqText,
  }));
}

/**
 * Load one course's Offering term codes for the "Typically offered" badge
 * (issue #23). Raw `YYYYT0` codes — the semester rollup is display-time logic
 * (`formatTypicallyOffered`), never stored (§6). An empty array is a course
 * with no ingested Banner history, which renders as no badge. Cached behind
 * the course page's `catalog` ISR tag like the rest of its reads.
 */
export async function listOfferingTermCodes(courseId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ termCode: offerings.termCode })
    .from(offerings)
    .where(eq(offerings.courseId, courseId));
  return rows.map((r) => r.termCode);
}

/**
 * Match catalog courses against a typed fragment for the review form's course
 * picker (§4/§13; issue #40). Server-backed on purpose: the client posts the
 * query and gets back at most `limit` rows, so the whole catalog never ships
 * to the browser. Matches the `SUBJ NUMBER` code form (with or without the
 * space, so `comp3270` works) and the title, case-insensitively; the caller
 * has already normalized the query and this escapes it, so typed `%`/`_`
 * match literally. Retired courses are included, matching {@link listCourses}
 * — they keep their pages and can still be reviewed within the term window.
 */
export async function searchCoursesByText(
  query: string,
  limit = 8,
): Promise<CourseSearchRow[]> {
  const db = getDb();
  const contains = `%${escapeLikePattern(query)}%`;
  const compact = `%${escapeLikePattern(query.replace(/ /g, ""))}%`;
  return db
    .select({
      id: courses.id,
      subject: courses.subject,
      number: courses.number,
      title: courses.title,
    })
    .from(courses)
    .where(
      or(
        sql`(${courses.subject} || ' ' || ${courses.number}) ilike ${contains}`,
        sql`(${courses.subject} || ${courses.number}) ilike ${compact}`,
        sql`${courses.title} ilike ${contains}`,
      ),
    )
    .orderBy(courses.subject, courses.number)
    .limit(limit);
}

/** One instructor eligible for a course's review-form dropdown (issue #24). */
export interface CourseInstructor {
  id: string;
  displayName: string;
}

/**
 * The instructors who have taught a course, for the review form's *scoped*
 * instructor dropdown (§4/§7; issue #24). Derived from the Banner
 * instructor-of-record links on the course's Offerings — the same data the
 * by-instructor breakdown (§5) is built from — so the dropdown offers exactly
 * the people who actually taught it, never the whole faculty. Distinct by
 * durable Instructor id and ordered by display name for a stable list. The two
 * "unknown" escapes (§4) are added by the form, not here — they aren't
 * instructors. An empty array is a course with no ingested offering history,
 * where the form falls back to the escapes alone.
 */
export async function listCourseInstructors(
  courseId: string,
): Promise<CourseInstructor[]> {
  const db = getDb();
  const rows = await db
    .selectDistinct({
      id: instructors.id,
      displayName: instructors.displayName,
    })
    .from(offeringInstructors)
    .innerJoin(instructors, eq(offeringInstructors.instructorId, instructors.id))
    .where(eq(offeringInstructors.courseId, courseId))
    .orderBy(instructors.displayName);

  return rows.map((r) => ({ id: r.id, displayName: r.displayName }));
}

/**
 * The persisted shape of a validated review submission (issue #24). The caller
 * (the submit action) has already run the full §4/§11 gate and resolved the
 * instructor choice into `instructorId` XOR `instructorUnknown`; this layer only
 * writes. Optional "Course details" arrive as already-normalized arrays/strings.
 */
export interface NewReview {
  courseId: string;
  instructorId: string | null;
  instructorUnknown: InstructorUnknown | null;
  termCode: string;
  overall: number;
  difficulty: number;
  workloadHours: number;
  body: string;
  identityHash: string;
  workloadShape: string[];
  grade: string | null;
  languages: string[];
  languagesOther: string | null;
  curved: string | null;
  attendance: string | null;
  prep: string | null;
}

/**
 * Insert a review (issue #24) and return its new id. `status` defaults to
 * `published` (§4/§11 publish-on-submit) via the schema. There is deliberately
 * NO pre-insert dedupe on `(identity_hash, course_id)` — multiple correlated
 * reviews per person per course are allowed (§4), so a second submission simply
 * inserts a second row. The row's durable `courseId`/`instructorId` are captured
 * here at write time and never moved by a later import (ADR 0001/0002).
 */
export async function insertReview(review: NewReview): Promise<string> {
  const db = getDb();
  const [row] = await db
    .insert(reviews)
    .values({
      courseId: review.courseId,
      instructorId: review.instructorId,
      instructorUnknown: review.instructorUnknown,
      termCode: review.termCode,
      overall: review.overall,
      difficulty: review.difficulty,
      workloadHours: review.workloadHours,
      body: review.body,
      identityHash: review.identityHash,
      workloadShape: review.workloadShape,
      grade: review.grade,
      languages: review.languages,
      languagesOther: review.languagesOther,
      curved: review.curved,
      attendance: review.attendance,
      prep: review.prep,
    })
    .returning({ id: reviews.id });
  return row.id;
}

/** A course's headline numbers (§5; issue #25): averages already gated under
 * the low-data rule, count always the true N. */
export interface CourseAggregates {
  overall: number | null;
  difficulty: number | null;
  workload: number | null;
  reviewCount: number;
}

/**
 * The course-wide headline aggregates (§5; issue #25): plain arithmetic means
 * over the course's published reviews, computed in SQL at revalidation time and
 * run through the low-data gate before they leave this layer. Deliberately NOT behind the
 * "catalog" tag — the course page reads this fresh on every (re)render, so a
 * review submit's `revalidatePath` refreshes the headline without an import.
 * The headline is fixed course-wide and never mutates on an instructor filter
 * (§5) — there is no instructor parameter here by design.
 */
export async function getCourseAggregates(
  courseId: string,
): Promise<CourseAggregates> {
  const db = getDb();
  const [row] = await db
    .select({
      reviewCount: sql<number>`count(*)::int`,
      overall: sql<number | null>`avg(${reviews.overall})::float8`,
      difficulty: sql<number | null>`avg(${reviews.difficulty})::float8`,
      workload: sql<number | null>`avg(${reviews.workloadHours})::float8`,
    })
    .from(reviews)
    .where(and(eq(reviews.courseId, courseId), publishedReviews()));

  const count = row?.reviewCount ?? 0;
  return {
    ...gateAverages(
      {
        overall: row?.overall ?? null,
        difficulty: row?.difficulty ?? null,
        workload: row?.workload ?? null,
      },
      count,
    ),
    reviewCount: count,
  };
}

// The stored escape-hatch sentinel, or null for anything else (§4).
const parseInstructorUnknown = (v: string | null): InstructorUnknown | null =>
  v === "not-listed" || v === "dont-remember" ? v : null;

// jsonb columns come back untyped; the writer only ever stores string arrays
// (sanitized multi-selects), so anything else collapses to empty.
function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

/**
 * A course's published reviews for its Reviews tab (§5; issue #25), each with
 * its resolved instructor display name (null when the review recorded an §4
 * unknown) and its live helpful tallies from `review_votes`. Unordered — the
 * sort options (helpful/newest/term) are `sortCourseReviews`'s job, client and
 * server sharing the one comparator. Like {@link getCourseAggregates}, read
 * fresh on every page (re)render, never behind the "catalog" tag, so submits
 * and votes surface on the next revalidation.
 */
export async function listCourseReviews(
  courseId: string,
): Promise<CourseReview[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: reviews.id,
      instructorId: reviews.instructorId,
      instructorName: instructors.displayName,
      instructorUnknown: reviews.instructorUnknown,
      termCode: reviews.termCode,
      overall: reviews.overall,
      difficulty: reviews.difficulty,
      workloadHours: reviews.workloadHours,
      body: reviews.body,
      workloadShape: reviews.workloadShape,
      grade: reviews.grade,
      languages: reviews.languages,
      languagesOther: reviews.languagesOther,
      curved: reviews.curved,
      attendance: reviews.attendance,
      prep: reviews.prep,
      createdAt: reviews.createdAt,
      helpfulUp: voteTally("up"),
      helpfulDown: voteTally("down"),
    })
    .from(reviews)
    .leftJoin(instructors, eq(reviews.instructorId, instructors.id))
    .leftJoin(reviewVotes, eq(reviewVotes.reviewId, reviews.id))
    .where(and(eq(reviews.courseId, courseId), publishedReviews()))
    .groupBy(reviews.id, instructors.displayName);

  return rows.map((r) => ({
    id: r.id,
    instructorId: r.instructorId,
    instructorName: r.instructorName,
    instructorUnknown: parseInstructorUnknown(r.instructorUnknown),
    termCode: r.termCode,
    overall: r.overall,
    difficulty: r.difficulty,
    workloadHours: r.workloadHours,
    body: r.body,
    workloadShape: asStringArray(r.workloadShape),
    grade: r.grade,
    languages: asStringArray(r.languages),
    languagesOther: r.languagesOther,
    curved: r.curved,
    attendance: r.attendance,
    prep: r.prep,
    createdAt: r.createdAt,
    helpfulUp: r.helpfulUp,
    helpfulDown: r.helpfulDown,
  }));
}

/**
 * Raw per-instructor aggregates over a course's published reviews (§5; issue
 * #25) — the review side of the by-instructor breakdown. UNGATED here: the
 * pure `buildInstructorRows` merges these with the taught-instructor list
 * ({@link listCourseInstructors}) and applies the low-data gate per row, so the
 * low-data rule lives in one testable place. Reviews recording an §4 unknown
 * have no instructor and are course-wide only — they appear in the headline
 * and the list, never in a breakdown row.
 */
export async function listInstructorStats(
  courseId: string,
): Promise<InstructorStats[]> {
  const db = getDb();
  return db
    .select({
      id: instructors.id,
      displayName: instructors.displayName,
      reviewCount: sql<number>`count(*)::int`,
      overall: sql<number | null>`avg(${reviews.overall})::float8`,
      difficulty: sql<number | null>`avg(${reviews.difficulty})::float8`,
      workload: sql<number | null>`avg(${reviews.workloadHours})::float8`,
    })
    .from(reviews)
    .innerJoin(instructors, eq(reviews.instructorId, instructors.id))
    .where(
      and(
        eq(reviews.courseId, courseId),
        publishedReviews(),
        isNotNull(reviews.instructorId),
      ),
    )
    .groupBy(instructors.id, instructors.displayName);
}

/**
 * Resolve a review id to what the vote action needs (issue #25): that it
 * exists and is published (only live reviews accept votes), and its course's
 * current code so the action can revalidate that course page. Null for an
 * unknown or unpublished review.
 */
export async function getReviewCourse(
  reviewId: string,
): Promise<{ courseId: string; subject: string; number: string } | null> {
  const db = getDb();
  const [row] = await db
    .select({
      courseId: reviews.courseId,
      subject: courses.subject,
      number: courses.number,
    })
    .from(reviews)
    .innerJoin(courses, eq(reviews.courseId, courses.id))
    .where(and(eq(reviews.id, reviewId), publishedReviews()))
    .limit(1);
  return row ?? null;
}

/**
 * Set (or clear) one identity's helpful vote on a review (§4/§5/§10; issue
 * #25). Votes are per-voter rows, retractable and flippable: the composite
 * primary key makes a re-vote an upsert (flip), and `null` deletes the row
 * (retraction). Idempotent — the client states the desired end state rather
 * than toggling, so a double-fire can't invert the intent.
 */
export async function setReviewVote(
  reviewId: string,
  identityHash: string,
  direction: VoteDirection | null,
): Promise<void> {
  const db = getDb();
  if (direction === null) {
    await db
      .delete(reviewVotes)
      .where(
        and(
          eq(reviewVotes.reviewId, reviewId),
          eq(reviewVotes.identityHash, identityHash),
        ),
      );
    return;
  }
  await db
    .insert(reviewVotes)
    .values({ reviewId, identityHash, direction })
    .onConflictDoUpdate({
      target: [reviewVotes.reviewId, reviewVotes.identityHash],
      set: { direction },
    });
}

/** A review's current helpful tallies, re-read after a vote write so the
 * action returns authoritative counts, not client arithmetic. */
export async function getReviewVoteCounts(
  reviewId: string,
): Promise<{ up: number; down: number }> {
  const db = getDb();
  const [row] = await db
    .select({ up: voteTally("up"), down: voteTally("down") })
    .from(reviewVotes)
    .where(eq(reviewVotes.reviewId, reviewId));
  return { up: row?.up ?? 0, down: row?.down ?? 0 };
}

/**
 * The signed-in viewer's live votes across one course's reviews (issue #25),
 * so the vote buttons can render their current state. Course pages are shared
 * CDN-static HTML — per-viewer state must never bake into them (§8) — so this
 * is read through the dynamic `/api/votes` route after mount, keyed by the
 * server-resolved identity (§7: the hash itself never reaches the client).
 */
export async function listViewerVotes(
  courseId: string,
  identityHash: string,
): Promise<Record<string, VoteDirection>> {
  const db = getDb();
  const rows = await db
    .select({ reviewId: reviewVotes.reviewId, direction: reviewVotes.direction })
    .from(reviewVotes)
    .innerJoin(reviews, eq(reviewVotes.reviewId, reviews.id))
    .where(
      and(
        eq(reviews.courseId, courseId),
        publishedReviews(),
        eq(reviewVotes.identityHash, identityHash),
      ),
    );

  const votes: Record<string, VoteDirection> = {};
  for (const row of rows) {
    if (row.direction === "up" || row.direction === "down") {
      votes[row.reviewId] = row.direction;
    }
  }
  return votes;
}

/** Count the catalog for the landing page's honest "N courses" line (#20). */
export async function getCourseCount(): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(courses);
  return rows[0]?.count ?? 0;
}

/**
 * Record a "Report this review" submission (§11.B/§12; issue #27) and return
 * the new row's id. The caller has already confirmed the review is live via
 * `getReviewCourse`; this is the durable record the operator email points at.
 */
export async function insertReviewReport(report: {
  reviewId: string;
  reason: string;
  details: string | null;
  reporterIdentityHash: string | null;
}): Promise<string> {
  const db = getDb();
  const [row] = await db
    .insert(reviewReports)
    .values(report)
    .returning({ id: reviewReports.id });
  return row.id;
}

// ---- My Activity (v1-spec §11/§13; issue #26) --------------------------------
// Every read and write below is keyed on the caller's `identity_hash`, resolved
// server-side from the session (§7) — the hash is the ONLY link between a
// person and their rows, so the WHERE clause is the authorization check.

/** The statuses an author may still act on (edit, delete): live on the site,
 * or queued behind the §12 panic switch. Mirrors `canEditReview`. */
const editableReviews = () =>
  or(eq(reviews.status, "published"), eq(reviews.status, "pending"));

/**
 * The signed-in author's own reviews in EVERY lifecycle state — published,
 * pending, removed, and (inside the retention window) deleted — each with its
 * course code/title, instructor, removal bookkeeping, and live helpful
 * tallies. This is the only read that surfaces `removed` rows to anyone but
 * the operator: §11's "author-notified, publicly silent." Unordered; grouping
 * and order are `groupMyReviews`'s job.
 */
export async function listMyReviews(identityHash: string): Promise<MyReview[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: reviews.id,
      courseSubject: courses.subject,
      courseNumber: courses.number,
      courseTitle: courses.title,
      instructorName: instructors.displayName,
      instructorUnknown: reviews.instructorUnknown,
      termCode: reviews.termCode,
      overall: reviews.overall,
      difficulty: reviews.difficulty,
      workloadHours: reviews.workloadHours,
      body: reviews.body,
      status: reviews.status,
      edited: reviews.edited,
      contested: reviews.contested,
      removedReason: reviews.removedReason,
      removedAt: reviews.removedAt,
      deletedAt: reviews.deletedAt,
      createdAt: reviews.createdAt,
      helpfulUp: voteTally("up"),
      helpfulDown: voteTally("down"),
    })
    .from(reviews)
    .innerJoin(courses, eq(reviews.courseId, courses.id))
    .leftJoin(instructors, eq(reviews.instructorId, instructors.id))
    .leftJoin(reviewVotes, eq(reviewVotes.reviewId, reviews.id))
    .where(eq(reviews.identityHash, identityHash))
    .groupBy(reviews.id, courses.id, instructors.displayName);

  return rows.map((r) => ({
    ...r,
    instructorUnknown: parseInstructorUnknown(r.instructorUnknown),
  }));
}

/**
 * The reviews the signed-in user has voted on (§13), built from
 * `review_votes`. A vote on a review that has since been removed or deleted
 * is still listed (the vote happened) but flagged not live, so the page
 * never links into a missing review. Newest vote first.
 */
export async function listMyVotes(identityHash: string): Promise<MyVote[]> {
  const db = getDb();
  const rows = await db
    .select({
      reviewId: reviewVotes.reviewId,
      direction: reviewVotes.direction,
      votedAt: reviewVotes.createdAt,
      courseSubject: courses.subject,
      courseNumber: courses.number,
      courseTitle: courses.title,
      reviewTermCode: reviews.termCode,
      body: reviews.body,
      status: reviews.status,
    })
    .from(reviewVotes)
    .innerJoin(reviews, eq(reviewVotes.reviewId, reviews.id))
    .innerJoin(courses, eq(reviews.courseId, courses.id))
    .where(eq(reviewVotes.identityHash, identityHash))
    .orderBy(desc(reviewVotes.createdAt));

  return rows.flatMap((r) => {
    if (r.direction !== "up" && r.direction !== "down") return [];
    return [
      {
        reviewId: r.reviewId,
        direction: r.direction,
        votedAt: r.votedAt,
        courseSubject: r.courseSubject,
        courseNumber: r.courseNumber,
        courseTitle: r.courseTitle,
        reviewTermCode: r.reviewTermCode,
        reviewExcerpt: excerpt(r.body),
        reviewLive: r.status === "published",
      },
    ];
  });
}

/** A review as the edit form needs it: the full stored content plus its
 * course, scoped to the author (`identityHash` in the WHERE) and to live
 * status (§11: removed/deleted reviews are not editable). Null otherwise. */
export async function getOwnEditableReview(
  reviewId: string,
  identityHash: string,
): Promise<OwnReview | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: reviews.id,
      courseId: courses.id,
      courseSubject: courses.subject,
      courseNumber: courses.number,
      courseTitle: courses.title,
      instructorId: reviews.instructorId,
      instructorUnknown: reviews.instructorUnknown,
      termCode: reviews.termCode,
      overall: reviews.overall,
      difficulty: reviews.difficulty,
      workloadHours: reviews.workloadHours,
      body: reviews.body,
      workloadShape: reviews.workloadShape,
      grade: reviews.grade,
      languages: reviews.languages,
      languagesOther: reviews.languagesOther,
      curved: reviews.curved,
      attendance: reviews.attendance,
      prep: reviews.prep,
      status: reviews.status,
    })
    .from(reviews)
    .innerJoin(courses, eq(reviews.courseId, courses.id))
    .where(and(eq(reviews.id, reviewId), eq(reviews.identityHash, identityHash)))
    .limit(1);
  if (!row || !canEditReview(row.status)) return null;
  return {
    ...row,
    instructorUnknown: parseInstructorUnknown(row.instructorUnknown),
    workloadShape: asStringArray(row.workloadShape),
    languages: asStringArray(row.languages),
  };
}

/** Everything an author may change on edit: the review minus its identity
 * (`courseId`, `identityHash`) and its term — the course and term are what the
 * review IS, not content on it; changing them is a new review. */
export type ReviewEdit = Omit<NewReview, "courseId" | "identityHash" | "termCode">;

/**
 * Apply an author's edit (§11): overwrite the content fields, stamp `edited`,
 * and leave `review_votes` untouched so helpful votes are KEPT. Scoped to the
 * author and to live status in the WHERE, so a forged id or a since-removed
 * review updates nothing. Returns whether a row was updated.
 */
export async function updateOwnReview(
  reviewId: string,
  identityHash: string,
  edit: ReviewEdit,
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .update(reviews)
    .set({ ...edit, edited: true })
    .where(
      and(
        eq(reviews.id, reviewId),
        eq(reviews.identityHash, identityHash),
        editableReviews(),
      ),
    )
    .returning({ id: reviews.id });
  return rows.length > 0;
}

/**
 * Author self-delete (§11): a SOFT delete — `status='deleted'` plus a
 * `deletedAt` stamp, content kept for the retention window and then purged by
 * runbook/purge-tombstones.sql. The row drops out of every aggregate and page
 * immediately via `publishedReviews()`. Only a live review can be deleted;
 * returns whether a row changed.
 */
export async function softDeleteOwnReview(
  reviewId: string,
  identityHash: string,
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .update(reviews)
    .set({ status: "deleted", deletedAt: new Date() })
    .where(
      and(
        eq(reviews.id, reviewId),
        eq(reviews.identityHash, identityHash),
        editableReviews(),
      ),
    )
    .returning({ id: reviews.id });
  return rows.length > 0;
}

/**
 * "Contest this removal" (§11): flip `contested=true` on the author's own
 * removed review. The operator resolves it by hand (§12,
 * runbook/contest-resolve.sql). Idempotent; returns whether a row changed.
 */
export async function contestOwnRemoval(
  reviewId: string,
  identityHash: string,
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .update(reviews)
    .set({ contested: true })
    .where(
      and(
        eq(reviews.id, reviewId),
        eq(reviews.identityHash, identityHash),
        eq(reviews.status, "removed"),
        eq(reviews.contested, false),
      ),
    )
    .returning({ id: reviews.id });
  return rows.length > 0;
}

/** The course a review belongs to, regardless of status — for revalidating
 * that course page after an edit or delete. Null for an unknown id. */
export async function getReviewCourseAnyStatus(
  reviewId: string,
): Promise<{ subject: string; number: string } | null> {
  const db = getDb();
  const [row] = await db
    .select({ subject: courses.subject, number: courses.number })
    .from(reviews)
    .innerJoin(courses, eq(reviews.courseId, courses.id))
    .where(eq(reviews.id, reviewId))
    .limit(1);
  return row ?? null;
}
