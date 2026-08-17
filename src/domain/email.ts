/**
 * The Auburn address gate (v1-spec §7) — the pure, browser-safe half of the
 * anonymity core. Split out of `anonymity.ts` (issue #47) so client
 * components can run the SAME domain check the server enforces without
 * dragging `node:crypto` into the bundle. `anonymity.ts` re-exports these, so
 * server code keeps importing them from the `@/domain` barrel unchanged.
 */

/**
 * The ONE accepted domain (owner decision 2026-08-17, PR #48). Auburn's
 * `@tigermail.auburn.edu` is the same mailbox as `@auburn.edu` (an alias, see
 * research/edu-verification-auth.md), so accepting only the canonical form
 * loses nobody — and lets the sign-in fields show the domain as a single
 * fixed suffix with no selector. Exported so those fields and this gate can
 * never disagree.
 */
export const AUBURN_DOMAIN = "auburn.edu";

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
  return normalized.slice(at + 1) === AUBURN_DOMAIN;
}

/**
 * What a user typed or pasted into the username-only sign-in field, resolved
 * (issue #47): the field shows `@auburn.edu` as a fixed suffix, so a FULL
 * address that lands in it — pasted, or browser-autofilled — is reduced to
 * its username once the part after the @ is our domain. Anything else (an
 * "@" typed mid-way, some other domain) is left exactly as typed, so a
 * keystroke is never swallowed; the field simply isn't a valid username while
 * it holds an "@" (see {@link isUsernameOnly}), and it resolves the moment
 * the typed domain completes.
 */
export function resolveTypedUsername(raw: string): string {
  const at = raw.indexOf("@");
  if (at === -1) return raw;
  const typedDomain = raw.slice(at + 1).trim().toLowerCase();
  return typedDomain === AUBURN_DOMAIN ? raw.slice(0, at) : raw;
}

/** True iff a username field holds a bare username (no "@"): the one thing
 * that must hold before it is joined to the fixed domain suffix, or an
 * address like `a@b@auburn.edu` could pass the domain gate. */
export function isUsernameOnly(local: string): boolean {
  return local.trim() !== "" && !local.includes("@");
}
