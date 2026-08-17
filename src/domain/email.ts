/**
 * The Auburn address gate (v1-spec §7) — the pure, browser-safe half of the
 * anonymity core. Split out of `anonymity.ts` (issue #47) so client
 * components can run the SAME domain check the server enforces (e.g. to keep
 * "Send code" disabled until an Auburn address is typed) without dragging
 * `node:crypto` into the bundle. `anonymity.ts` re-exports these, so server
 * code keeps importing them from the `@/domain` barrel unchanged.
 */

/** The two deliverable Auburn student domains (v1-spec §7). Both resolve to
 * the same person; either is accepted. Exported so the sign-in fields can
 * offer them as a fixed suffix (the user types only the part before the @) —
 * the same list this module's gate checks against. */
export const AUBURN_DOMAINS = ["auburn.edu", "tigermail.auburn.edu"] as const;
export type AuburnDomain = (typeof AUBURN_DOMAINS)[number];

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

/**
 * Split what a user typed or pasted into a username-only field into its parts
 * (issue #47): the sign-in fields show the domain as a fixed suffix, so a full
 * address that lands in the field — pasted, or browser-autofilled — is split
 * into the username and that domain — but ONLY once the part after the @ is a
 * domain we accept. Anything else (an "@" typed mid-way, an unknown domain) is
 * left exactly as typed, so a keystroke is never swallowed; the field simply
 * isn't a valid username while it holds an "@" (see {@link isUsernameOnly}),
 * and it resolves the moment the typed domain becomes one of ours.
 */
export function splitTypedEmail(
  raw: string,
  currentDomain: AuburnDomain,
): { local: string; domain: AuburnDomain } {
  const at = raw.indexOf("@");
  if (at === -1) return { local: raw, domain: currentDomain };
  const typedDomain = raw.slice(at + 1).trim().toLowerCase();
  const known = AUBURN_DOMAINS.find((d) => d === typedDomain);
  if (!known) return { local: raw, domain: currentDomain };
  return { local: raw.slice(0, at), domain: known };
}

/** True iff a username field holds a bare username (no "@"): the one thing
 * that must hold before it is joined to the fixed domain suffix, or an
 * address like `a@b@auburn.edu` could pass the domain gate. */
export function isUsernameOnly(local: string): boolean {
  return local.trim() !== "" && !local.includes("@");
}
