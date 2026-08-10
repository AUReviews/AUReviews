/**
 * Email-send rate limiting (v1-spec §7, research §5).
 *
 * Two parts, kept separate so the policy is unit-testable without a database:
 *   - `evaluateSendRateLimit` — the pure decision over already-counted hits.
 *   - `checkAndRecordSend` — the DB-backed gate that counts the trailing window
 *     of `email_send_log`, evaluates, and (on allow) records the attempt.
 *
 * The gate is called from the sign-in server action BEFORE `signIn` runs, so a
 * throttled request never reaches token issuance — it can't rotate a victim's
 * live magic link (v1-spec §7: "one live verification token per address").
 *
 * Addresses are logged as a keyed hash, never plaintext (v1-spec §7): the same
 * HMAC used for `identity_hash` feeds per-address counting, so no email is
 * persisted here either. IP is a coarse per-IP throttle against enumeration.
 */
import { and, gte, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { emailSendLog } from "@/db/schema";
import type { IdentityHash } from "@/domain";

/** Launch limits (v1-spec §7). Held here, not hardcoded at call sites. The
 * global/day ceiling sits well under Resend's 100/day free-tier cap so a spike
 * can't burn the daily quota. */
export const SEND_LIMITS = {
  perAddressPerHour: 3,
  perIpPerHour: 10,
  globalPerDay: 90,
} as const;

export type RateLimitReason = "address" | "ip" | "global";

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; reason: RateLimitReason };

/**
 * Pure policy: given how many sends this address and this IP have made in the
 * last hour, and how many sends happened globally in the last day, decide
 * whether one more is allowed. Checked most-specific-first (address, then IP,
 * then the global ceiling) so the caller gets the tightest applicable reason.
 */
export function evaluateSendRateLimit(input: {
  addressCountLastHour: number;
  ipCountLastHour: number;
  globalCountLastDay?: number;
  limits?: {
    perAddressPerHour: number;
    perIpPerHour: number;
    globalPerDay: number;
  };
}): RateLimitDecision {
  const limits = input.limits ?? SEND_LIMITS;
  if (input.addressCountLastHour >= limits.perAddressPerHour) {
    return { allowed: false, reason: "address" };
  }
  if (input.ipCountLastHour >= limits.perIpPerHour) {
    return { allowed: false, reason: "ip" };
  }
  if ((input.globalCountLastDay ?? 0) >= limits.globalPerDay) {
    return { allowed: false, reason: "global" };
  }
  return { allowed: true };
}

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

async function countSince(
  column: typeof emailSendLog.addressHash | typeof emailSendLog.ip,
  value: string,
  since: Date,
): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(emailSendLog)
    .where(and(sql`${column} = ${value}`, gte(emailSendLog.createdAt, since)));
  return row?.count ?? 0;
}

/**
 * DB-backed gate: count this address's and this IP's sends in the trailing hour
 * and all sends in the trailing day, apply {@link evaluateSendRateLimit}, and
 * record the attempt when allowed. Call this BEFORE issuing a magic link. `now`
 * is injectable for tests.
 */
export async function checkAndRecordSend(input: {
  addressHash: IdentityHash;
  ip: string;
  now?: Date;
}): Promise<RateLimitDecision> {
  const db = getDb();
  const now = input.now ?? new Date();
  const hourAgo = new Date(now.getTime() - ONE_HOUR_MS);
  const dayAgo = new Date(now.getTime() - ONE_DAY_MS);

  const [addressCountLastHour, ipCountLastHour] = await Promise.all([
    countSince(emailSendLog.addressHash, input.addressHash, hourAgo),
    countSince(emailSendLog.ip, input.ip, hourAgo),
  ]);

  const [globalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(emailSendLog)
    .where(gte(emailSendLog.createdAt, dayAgo));

  const decision = evaluateSendRateLimit({
    addressCountLastHour,
    ipCountLastHour,
    globalCountLastDay: globalRow?.count ?? 0,
  });

  if (decision.allowed) {
    await db.insert(emailSendLog).values({
      addressHash: input.addressHash,
      ip: input.ip,
      createdAt: now,
    });
  }

  return decision;
}
