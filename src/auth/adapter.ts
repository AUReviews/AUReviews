/**
 * Custom Auth.js adapter (issue #19, v1-spec §7).
 *
 * A stock adapter stores the user's email in a `users` row and hands it back in
 * the session — exactly what the anonymity architecture forbids. This adapter
 * inverts that: the moment an address is known (createUser / getUserByEmail /
 * updateUser) it is folded into `identity_hash = HMAC(PEPPER, normalize(email))`
 * and only the hash is persisted (in `identities`). The email is never at rest
 * anywhere: `verification_tokens` stores the same peppered hash as its
 * identifier (issue #43), so even the transient token row carries no address.
 *
 * The `AdapterUser` type demands an `email` field, so we return the empty string
 * for it everywhere — no read path ever exposes the real address, and the
 * `session` callback (see ./index.ts) strips even that. Server code that needs to
 * attribute a write resolves the session to `identity_hash` via ./session.ts,
 * never through this synthetic user object.
 */
import { and, eq, sql } from "drizzle-orm";
import type { Adapter, AdapterSession, AdapterUser } from "next-auth/adapters";
import { getDb } from "@/db/client";
import { identities, sessions, verificationTokens } from "@/db/schema";
import { computeIdentityHash } from "@/domain";
import { getPepper } from "./pepper";

/** Wrong guesses allowed against one code before it is invalidated (issue #43).
 * Bounds the 10^6 six-digit space: 5 tries ≈ a 0.0005% per-token ceiling. */
export const MAX_CODE_ATTEMPTS = 5;

/** The stored form of a token identifier: the same peppered HMAC as
 * `identity_hash` (normalization included), so no address is ever at rest. */
function hashTokenIdentifier(identifier: string): string {
  return computeIdentityHash(getPepper(), identifier);
}

/** Shape returned for every user read/write. The email is deliberately blanked —
 * we hold only the hash, and this object never reaches the client. */
function toAdapterUser(row: {
  id: string;
  verifiedAt: Date;
}): AdapterUser {
  return { id: row.id, email: "", emailVerified: row.verifiedAt };
}

/** Fetch one identity by its opaque id, or null. Shared by getUser/updateUser. */
async function selectIdentityById(id: string) {
  const db = getDb();
  const [row] = await db
    .select({ id: identities.id, verifiedAt: identities.verifiedAt })
    .from(identities)
    .where(eq(identities.id, id))
    .limit(1);
  return row ?? null;
}

export function createHashingAdapter(): Adapter {
  return {
    async createUser(user) {
      // `user.email` is the just-verified address; hash it and discard it.
      const identityHash = computeIdentityHash(getPepper(), user.email);
      const db = getDb();
      const [row] = await db
        .insert(identities)
        .values({ identityHash })
        .onConflictDoUpdate({
          target: identities.identityHash,
          // Idempotent: a re-verification of the same address returns the
          // existing identity rather than erroring on the unique constraint.
          set: { identityHash },
        })
        .returning({ id: identities.id, verifiedAt: identities.verifiedAt });
      return toAdapterUser(row);
    },

    async getUser(id) {
      const row = await selectIdentityById(id);
      return row ? toAdapterUser(row) : null;
    },

    async getUserByEmail(email) {
      const identityHash = computeIdentityHash(getPepper(), email);
      const db = getDb();
      const [row] = await db
        .select({ id: identities.id, verifiedAt: identities.verifiedAt })
        .from(identities)
        .where(eq(identities.identityHash, identityHash))
        .limit(1);
      if (!row) return null;
      // Echo the caller's address back — Auth.js needs it to run the signIn
      // domain re-check when a RETURNING user requests a new link (otherwise a
      // blanked email fails the check and throws AccessDenied). This address is
      // the method's own input, used transiently server-side; it is never stored
      // (identities has no email column) and never reaches the client, because
      // the session is built from getSessionAndUser, which stays blanked.
      return { id: row.id, email, emailVerified: row.verifiedAt };
    },

    // No OAuth accounts in v1 — the email provider never links one.
    async getUserByAccount() {
      return null;
    },

    async updateUser(user) {
      // The only mutable attribute is verification recency; there is no email to
      // change. Return the current row unchanged.
      const row = await selectIdentityById(user.id);
      if (!row) throw new Error(`identity ${user.id} not found`);
      return toAdapterUser(row);
    },

    async deleteUser(userId) {
      const db = getDb();
      // Sessions cascade via the FK.
      await db.delete(identities).where(eq(identities.id, userId));
    },

    // Email-only flow: account linking is never exercised.
    async linkAccount() {
      return undefined;
    },
    async unlinkAccount() {
      return undefined;
    },

    async createSession(session) {
      const db = getDb();
      const [row] = await db
        .insert(sessions)
        .values({
          sessionToken: session.sessionToken,
          userId: session.userId,
          expires: session.expires,
        })
        .returning();
      return row as AdapterSession;
    },

    async getSessionAndUser(sessionToken) {
      const db = getDb();
      const [row] = await db
        .select({
          sessionToken: sessions.sessionToken,
          userId: sessions.userId,
          expires: sessions.expires,
          id: identities.id,
          verifiedAt: identities.verifiedAt,
        })
        .from(sessions)
        .innerJoin(identities, eq(sessions.userId, identities.id))
        .where(eq(sessions.sessionToken, sessionToken))
        .limit(1);
      if (!row) return null;
      return {
        session: {
          sessionToken: row.sessionToken,
          userId: row.userId,
          expires: row.expires,
        },
        user: toAdapterUser({ id: row.id, verifiedAt: row.verifiedAt }),
      };
    },

    async updateSession(session) {
      const db = getDb();
      const [row] = await db
        .update(sessions)
        .set({ expires: session.expires })
        .where(eq(sessions.sessionToken, session.sessionToken))
        .returning();
      return (row as AdapterSession) ?? null;
    },

    async deleteSession(sessionToken) {
      const db = getDb();
      await db.delete(sessions).where(eq(sessions.sessionToken, sessionToken));
    },

    async createVerificationToken(token) {
      const db = getDb();
      const identifier = hashTokenIdentifier(token.identifier);
      // One live code per address (v1-spec §7): drop any prior token for this
      // identifier before issuing a new one, so an old code can't still work.
      await db
        .delete(verificationTokens)
        .where(eq(verificationTokens.identifier, identifier));
      await db
        .insert(verificationTokens)
        .values({ identifier, token: token.token, expires: token.expires });
      // Echo the input: Auth.js expects the identifier it passed, not our hash.
      return token;
    },

    async useVerificationToken({ identifier, token }) {
      const db = getDb();
      const hashedIdentifier = hashTokenIdentifier(identifier);
      // Single-use: delete-and-return, so a correct code works exactly once.
      const [match] = await db
        .delete(verificationTokens)
        .where(
          and(
            eq(verificationTokens.identifier, hashedIdentifier),
            eq(verificationTokens.token, token),
          ),
        )
        .returning();
      if (match) {
        // Auth.js compares the returned identifier against its email param and
        // then builds the user from it — hand back the caller's raw address.
        return { identifier, token: match.token, expires: match.expires };
      }
      // Wrong code: count the guess against the address's live token (if any),
      // atomically, and invalidate it once the cap is reached (issue #43). The
      // caller sees only null either way — wrong, expired, and exhausted are
      // indistinguishable from outside.
      const [counted] = await db
        .update(verificationTokens)
        .set({ attempts: sql`${verificationTokens.attempts} + 1` })
        .where(eq(verificationTokens.identifier, hashedIdentifier))
        .returning();
      if (counted && counted.attempts >= MAX_CODE_ATTEMPTS) {
        await db
          .delete(verificationTokens)
          .where(eq(verificationTokens.identifier, hashedIdentifier));
      }
      return null;
    },
  };
}
