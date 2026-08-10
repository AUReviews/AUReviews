/**
 * Anonymity core (v1-spec §7, research/edu-verification-auth.md §4).
 *
 * The three load-bearing pure functions behind "verify an Auburn affiliate, then
 * hold only a non-reversible token." This module is deliberately framework- and
 * persistence-agnostic (ADR 0002 boundary): it takes a pepper and an email and
 * returns values; it never reads env, a DB, or a request. The auth layer
 * (`src/auth/`) supplies the pepper from a secret manager and does the storing.
 *
 * Why a keyed hash and not a salted one: an Auburn address is low-entropy and
 * enumerable (~10^8 candidates), so a salt stored beside the hash would be
 * brute-forceable. HMAC with a pepper held OUTSIDE the database is not — that is
 * the whole anonymity guarantee (research §4, option C).
 */
import { createHmac } from "node:crypto";

/** The two deliverable Auburn affiliate domains (v1-spec §7). Both resolve to
 * the same person; either is accepted. */
const AUBURN_DOMAINS = ["auburn.edu", "tigermail.auburn.edu"] as const;

/**
 * Non-reversible, HMAC-peppered author token. Branded so it can't be confused
 * with a raw email or an arbitrary string. Never sent to the client (v1-spec §7).
 */
export type IdentityHash = string & { readonly __brand: "IdentityHash" };

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
 * True iff the address is a verified-Auburn-affiliate address — the §7 gate,
 * applied "before doing anything else." Matches on the domain as a whole label,
 * not a substring, so `auburn.edu.evil.com` and `notauburn.edu` are rejected.
 */
export function isAuburnAffiliateEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  // Reject no-`@`, empty local part, or empty domain.
  if (at <= 0 || at === normalized.length - 1) return false;
  const domain = normalized.slice(at + 1);
  return AUBURN_DOMAINS.some((d) => domain === d);
}

/**
 * `identity_hash = HMAC_SHA256(PEPPER, normalize(email))` (v1-spec §7 step 3).
 * Returns a 64-char lowercase hex digest. Throws on an empty pepper so a missing
 * secret can never silently degrade this to an unkeyed, brute-forceable hash.
 */
export function computeIdentityHash(pepper: string, email: string): IdentityHash {
  if (!pepper) {
    throw new Error(
      "PEPPER is empty. It must be a non-empty secret held outside the database " +
        "(v1-spec §7); an empty pepper would make identity_hash brute-forceable.",
    );
  }
  return createHmac("sha256", pepper)
    .update(normalizeEmail(email))
    .digest("hex") as IdentityHash;
}
