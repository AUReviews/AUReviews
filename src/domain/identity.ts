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
