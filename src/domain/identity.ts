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
