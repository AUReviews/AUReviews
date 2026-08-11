/**
 * Durable internal identities (ADR 0001).
 *
 * Auburn provides no id that survives a renumber/rename/split, so we mint our
 * own opaque, never-changing `CourseId`. Auburn's `(subject, number, title)` are
 * demoted to mutable attributes; reviews and offerings reference the durable id,
 * never the Auburn string. This module is pure — no framework, no persistence.
 */

/** Opaque, internally-minted Course identity. Branded so it can't be confused
 * with an arbitrary string. */
export type CourseId = string & { readonly __brand: "CourseId" };

/** Mint a fresh, never-changing Course id. */
export function mintCourseId(): CourseId {
  return crypto.randomUUID() as CourseId;
}

/** Opaque, internally-minted Instructor identity (ADR 0001 — same philosophy
 * as {@link CourseId}: Banner's names and even its person keys are demoted to
 * mutable attributes; Offerings and Reviews reference this id alone). */
export type InstructorId = string & { readonly __brand: "InstructorId" };

/** Mint a fresh, never-changing Instructor id. */
export function mintInstructorId(): InstructorId {
  return crypto.randomUUID() as InstructorId;
}

/**
 * Normalize an instructor display name for *matching* (issue #23): trimmed,
 * inner whitespace collapsed (Banner pads names irregularly), upper-cased.
 * Used only to key instructors that expose no stable Banner person key and to
 * detect ambiguous matches that must surface for an admin decision — never to
 * assert identity, which is the durable {@link InstructorId} alone.
 */
export function normalizeInstructorName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * Normalize an Auburn `(subject, number)` into the natural key the crosswalk
 * matches on (#18) — case- and whitespace-insensitive. The durable `CourseId`,
 * not this key, is identity (ADR 0001); this only feeds crosswalk matching.
 */
export function normalizeCatalogKey(input: {
  subject: string;
  number: string;
}): string {
  const subject = input.subject.trim().toUpperCase();
  const number = input.number.trim().toUpperCase();
  return `${subject} ${number}`;
}

/**
 * Normalize a course title for *matching* (case- and whitespace-insensitive:
 * trimmed, inner runs of whitespace collapsed, upper-cased). Punctuation is left
 * intact. Used only to detect candidate renumbers/cross-lists that must surface
 * for an admin decision (#18) — never to assert identity, which is the durable
 * `CourseId` alone (ADR 0001).
 */
export function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toUpperCase();
}
