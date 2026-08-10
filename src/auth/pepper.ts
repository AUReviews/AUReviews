/**
 * The HMAC pepper (v1-spec §7): a secret that lives in the host's env / secret
 * manager and NEVER in the database. It is the single value that makes
 * `identity_hash` non-reversible, so a missing or empty pepper is a hard error —
 * we refuse to hash rather than silently produce a weak, brute-forceable token.
 */
export function getPepper(): string {
  const pepper = process.env.PEPPER;
  if (!pepper) {
    throw new Error(
      "PEPPER is not set. It is the HMAC key for identity_hash and MUST be a " +
        "long random secret held outside the database (v1-spec §7). See .env.example.",
    );
  }
  return pepper;
}
