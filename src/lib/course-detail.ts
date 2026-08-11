/**
 * Course detail presentation logic (v1-spec §6/§13; issue #21) — pure,
 * framework- and DB-free, so URL slugging and catalog-attribute formatting are
 * unit-testable in isolation. The `db` layer supplies a {@link CourseDetail} and
 * the `courses/[code]` route renders it; both defer slug parsing and every
 * display-string decision to this module (the same split as `browse.ts`).
 *
 * A course is addressed in the URL by its CURRENT catalog code (`comp-3270`),
 * not its durable internal id — the shareable, conventional form. This is a
 * display/routing concern only: reviews still attach to the durable `Course.id`
 * (ADR 0001), and because the crosswalk retains old catalog keys across a
 * renumber (ADR 0002), an old code URL can still be made to resolve later.
 */

import { rollupOfferedSemesters } from "@/domain";
import type { BrowseCourse } from "./browse";

/**
 * The full catalog-side record a course page renders (issue #21). It IS a
 * {@link BrowseCourse} — same id/code/status and same nullable rating columns,
 * so the low-data display rule (§5) and the review seam stay defined in exactly
 * one place — plus the extra catalog attributes only the detail page shows. The
 * three averages are `null` and `reviewCount` is 0 in v1 until reviews land (#6).
 */
export interface CourseDetail extends BrowseCourse {
  description: string | null;
  creditHours: string | null;
  prereqText: string | null;
  catalogYear: string;
}

/** Build the URL slug for a course from its current catalog code: `comp-3270`. */
export function courseSlug(subject: string, number: string): string {
  return `${subject}-${number}`.toLowerCase();
}

/**
 * Parse a `subject-number` slug back into upper-cased catalog attributes the DB
 * query keys on, or `null` if the slug is malformed. Exactly one separator, a
 * non-empty alphabetic subject, and a non-empty alphanumeric number — so a bad
 * URL is a clean 404 rather than a failed query.
 */
export function parseCourseSlug(
  slug: string,
): { subject: string; number: string } | null {
  const match = /^([a-z]+)-([a-z0-9]+)$/i.exec(slug);
  if (!match) return null;
  return { subject: match[1].toUpperCase(), number: match[2].toUpperCase() };
}

/** The display code: `COMP 3270`. */
export function formatCourseCode(subject: string, number: string): string {
  return `${subject} ${number}`;
}

/**
 * Format the verbatim credit token for display, or `null` when absent. The
 * token is free text (a single value like `3` or a range like `1-3`, §9), so a
 * range's hyphen becomes an en dash and only an exact `1` takes the singular.
 */
export function formatCreditHours(creditHours: string | null): string | null {
  const token = creditHours?.trim();
  if (!token) return null;
  const label = token === "1" ? "credit hour" : "credit hours";
  return `${token.replace(/-/g, "–")} ${label}`;
}

/**
 * The catalog-year stamp (§6) — "how current is this page". The ingest stores
 * an academic-year range (`2026-2027`); normalize its hyphen to an en dash and
 * stamp it, without inventing a range for a bare value.
 */
export function formatCatalogYear(catalogYear: string): string {
  return `${catalogYear.trim().replace(/-/g, "–")} catalog`;
}

// A `Pr.`/`Coreq.` clause, marker through the first terminating period — the
// same shape the ingest lifts into `prereqText` and the parser structures.
const PREREQ_CLAUSE_RE = /(?:Pr\.|Coreq\.)[^.]*\./g;
// The leading run of bulletin contact-type codes and their hour numbers that
// heads a course body (`LEC. 3. LAB. 3.`). An allowlist, not a generic all-caps
// match, so a description that opens on a real abbreviation (`AI, …`) is safe.
const LOAD_PREFIX_RE =
  /^\s*(?:(?:LEC|LAB|REC|SEM|STU|FLD|IND|LST|SU)\.\s*|LEC\/LAB\.\s*|\d+\.\s*)+/;

/**
 * Clean a raw bulletin course body into just its prose description for display
 * (issue #22). The stored `description` is the lossless body — it still carries
 * the `LEC./LAB.` contact-hour breakdown (now in the header credit line) and the
 * `Pr./Coreq.` prerequisite prose (now the Prerequisites/Unlocks chips). This
 * drops that duplicated scaffolding: every `Pr.`/`Coreq.` clause, then the
 * leading run of contact-type codes. Returns null when only scaffolding remains
 * (or there was no description), so the page shows its "No catalog description on
 * file." state. Purely presentational — the lossless body stays in the DB.
 */
export function formatCourseDescription(
  description: string | null,
): string | null {
  if (!description) return null;
  const cleaned = description
    .replace(PREREQ_CLAUSE_RE, " ")
    .replace(LOAD_PREFIX_RE, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

/**
 * The "Typically offered" badge text (§6; issue #23): a display-time rollup of
 * the distinct semesters in the course's Banner Offering history — computed on
 * every render, never a stored flag, so it self-corrects as offerings accrue.
 * Returns null when there is no usable history (no offerings ingested yet, or
 * a course Banner never listed), and the page simply shows no badge.
 */
export function formatTypicallyOffered(termCodes: string[]): string | null {
  const semesters = rollupOfferedSemesters(termCodes);
  if (semesters.length === 0) return null;
  return `Typically offered: ${semesters.join(", ")}`;
}

/** Link to a course's detail page. */
export function courseHref(subject: string, number: string): string {
  return `/courses/${courseSlug(subject, number)}`;
}

/**
 * Link to the review form for a course. The form itself is a later ticket (§13);
 * this course-scoped route is the placeholder target the "write a review" CTA
 * points at for now (issue #21).
 */
export function reviewFormHref(subject: string, number: string): string {
  return `/courses/${courseSlug(subject, number)}/review`;
}
