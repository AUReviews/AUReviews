/**
 * Anonymity core (v1-spec §7, research/edu-verification-auth.md §4).
 *
 * The three load-bearing pure functions behind "verify an Auburn student, then
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
import { normalizeEmail } from "./email";

// The address gate and its normalization live in ./email — the browser-safe
// half (no crypto) that client components import directly (issue #47). They
// are re-exported here so the `@/domain` barrel's surface is unchanged.
export { isAuburnStudentEmail, normalizeEmail } from "./email";

/**
 * Non-reversible, HMAC-peppered author token. Branded so it can't be confused
 * with a raw email or an arbitrary string. Never sent to the client (v1-spec §7).
 */
export type IdentityHash = string & { readonly __brand: "IdentityHash" };

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
