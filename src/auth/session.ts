/**
 * Server-side resolution of the current session to its `identity_hash`
 * (v1-spec §7 steps 4 & 7). The opaque database session-token cookie is mapped
 * here, on the server only, to the author token that later edit/delete/vote
 * actions (#24) key on. The hash never travels to the client — this is the one
 * sanctioned way to obtain it for the signed-in request.
 */
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { identities, sessions } from "@/db/schema";
import type { IdentityHash } from "@/domain";

// Auth.js database-strategy cookie names: unprefixed in dev, __Secure- over https.
const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
] as const;

/**
 * The current signed-in user's `identity_hash`, or `null` if there is no valid,
 * unexpired session. Safe to call from Server Components, Route Handlers, and
 * Server Actions.
 */
export async function getCurrentIdentityHash(): Promise<IdentityHash | null> {
  const store = await cookies();
  let token: string | undefined;
  for (const name of SESSION_COOKIE_NAMES) {
    const value = store.get(name)?.value;
    if (value) {
      token = value;
      break;
    }
  }
  if (!token) return null;

  const db = getDb();
  const [row] = await db
    .select({
      identityHash: identities.identityHash,
      expires: sessions.expires,
    })
    .from(sessions)
    .innerJoin(identities, eq(sessions.userId, identities.id))
    .where(eq(sessions.sessionToken, token))
    .limit(1);

  if (!row) return null;
  if (row.expires.getTime() <= Date.now()) return null;
  return row.identityHash as IdentityHash;
}
