/**
 * The Auburn address gate (v1-spec §7) — the pure, browser-safe half of the
 * anonymity core. Split out of `anonymity.ts` (issue #47) so client
 * components can run the SAME domain check the server enforces (e.g. to keep
 * "Send code" disabled until an Auburn address is typed) without dragging
 * `node:crypto` into the bundle. `anonymity.ts` re-exports these, so server
 * code keeps importing them from the `@/domain` barrel unchanged.
 */

/** The two deliverable Auburn student domains (v1-spec §7). Both resolve to
 * the same person; either is accepted. */
const AUBURN_DOMAINS = ["auburn.edu", "tigermail.auburn.edu"] as const;

/**
 * Canonical form of an address for both the domain check and hashing: trimmed
 * and lower-cased. Auburn addresses carry no inner whitespace, so edge-trimming
 * plus lower-casing is the whole normalization — and it must be identical
 * everywhere or the same person would hash to two different `identity_hash`es.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * True iff the address is a verified-Auburn-student address — the §7 gate,
 * applied "before doing anything else." Matches on the domain as a whole label,
 * not a substring, so `auburn.edu.evil.com` and `notauburn.edu` are rejected.
 */
export function isAuburnStudentEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  // Reject no-`@`, empty local part, or empty domain.
  if (at <= 0 || at === normalized.length - 1) return false;
  const domain = normalized.slice(at + 1);
  return AUBURN_DOMAINS.some((d) => domain === d);
}
