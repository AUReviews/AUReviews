/**
 * The typed sign-in code (issue #43): 6 uniformly random digits, minted as the
 * Auth.js verification token via the provider's `generateVerificationToken`.
 * A 10^6 space is safe because guessing is bounded — the adapter invalidates
 * the token after MAX_CODE_ATTEMPTS wrong tries (see ./adapter.ts) and send
 * limits cap how many live codes exist (see ./rate-limit.ts).
 */
import { randomInt } from "node:crypto";

export function generateSignInCode(): string {
  // randomInt is uniform over [0, 1e6) — padStart keeps leading zeros.
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** `123456` → `123 456`: how the code is rendered in the email. */
export function formatCodeForDisplay(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}
