/**
 * Course-picker search logic (v1-spec §4/§13; issue #40) — the pure half of the
 * review form's server-backed typeahead. The form searches the catalog by code
 * or title instead of shipping the whole catalog to the client; this module
 * owns query normalization, LIKE escaping, and the option shape the client
 * renders, so the DB query (`searchCoursesByText`) and the server action stay
 * thin. Framework- and DB-free, like the rest of `lib`.
 */

import { courseSlug, formatCourseCode } from "./course-detail";

/** The catalog columns the typeahead matches and displays. */
export interface CourseSearchRow {
  id: string;
  subject: string;
  number: string;
  title: string;
}

/**
 * One selectable result in the form's course picker: the durable id the
 * instructor lookup keys on, the slug the submit action posts (re-resolved
 * server-side, ADR 0001), and the `COMP 3270 · Title` display label.
 */
export interface CourseOption {
  id: string;
  slug: string;
  label: string;
}

// Two characters is the least that usefully narrows a catalog ("co", "32");
// one keystroke would match nearly everything and just flash noise.
const MIN_QUERY_LENGTH = 2;
// Generous for any real code-or-title fragment while bounding the LIKE scan.
const MAX_QUERY_LENGTH = 80;

/**
 * Normalize raw typeahead input into the query the DB matches, or `null` when
 * it is too short to search: trimmed, internal whitespace collapsed (so
 * `comp   3270` matches the `SUBJ NUMBER` form), and capped in length.
 */
export function normalizeCourseSearchQuery(raw: string): string | null {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (collapsed.length < MIN_QUERY_LENGTH) return null;
  return collapsed.slice(0, MAX_QUERY_LENGTH);
}

/**
 * Escape a user-typed fragment for use inside a SQL LIKE/ILIKE pattern with
 * `\` as the escape character, so `%`/`_` in the input match literally rather
 * than acting as wildcards.
 */
export function escapeLikePattern(fragment: string): string {
  return fragment.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** Shape a matched catalog row into the option the course picker renders. */
export function toCourseOption(row: CourseSearchRow): CourseOption {
  return {
    id: row.id,
    slug: courseSlug(row.subject, row.number),
    label: `${formatCourseCode(row.subject, row.number)} · ${row.title}`,
  };
}
