/**
 * The sign-in code exchange (issue #47, ADR 0003): turn a typed 6-digit code
 * plus its address into a session — server-side, in-process, with NO
 * navigation. This is a server-only module, not an HTTP endpoint: it adds zero
 * public surface. Both `/signin`'s verify action and `submitReview` call it, so
 * a review can be posted and the author signed in inside one server action.
 *
 * Auth.js remains the auth system — it still mints and hashes the token
 * (`signIn("resend")` → `sendToken`), owns the session strategy, `signOut`,
 * `useSession`, and the `/api/auth/*` handlers. Only this exchange step is
 * ours, and it deliberately reproduces two Auth.js internals so its output is
 * indistinguishable from a callback-route sign-in:
 *   1. the verification-token hash — `sha256(token + secret)`, hex — so the
 *      adapter lookup matches what `sendToken` stored;
 *   2. the session cookie contract — `authjs.session-token` (dev) /
 *      `__Secure-authjs.session-token` (https), httpOnly, sameSite=lax, path=/,
 *      expiring with the session — so `useSession` and the session route see it.
 * Both are pinned by `exchange.roundtrip.test.ts`, which mints a code through
 * the REAL `signIn("resend")` path and reads the resulting session back through
 * the REAL Auth.js session route: if Auth.js ever changes either contract, that
 * test fails loudly instead of every sign-in silently breaking.
 *
 * Everything else stays with the adapter (./adapter.ts): single-use
 * delete-and-return, the 5-attempt cap, the peppered token identifier, and the
 * hash-only identity — none of that is duplicated here.
 */
import { createHash, randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import type { Adapter } from "next-auth/adapters";
import {
  type IdentityHash,
  computeIdentityHash,
  isAuburnStudentEmail,
  normalizeEmail,
} from "@/domain";
import { createHashingAdapter } from "./adapter";
import { getPepper } from "./pepper";

/** Auth.js's default database-session life (`session.maxAge`, 30 days). */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** Why an exchange failed. `Verification` is deliberately the one bucket for
 * wrong, expired, and exhausted codes (issue #43: indistinguishable from
 * outside) and matches the error code Auth.js itself redirects with, so the
 * shared sign-in copy map covers both paths. `domain` is not secret — the send
 * step already refuses such addresses with the same message. */
export type ExchangeFailure = "domain" | "Verification";

export type ExchangeResult =
  | { ok: true; identityHash: IdentityHash }
  | { ok: false; reason: ExchangeFailure };

/** How Auth.js hashes a verification token before storing/looking it up:
 * `sha256(token + secret)` as lowercase hex (`@auth/core` `createHash`). The
 * secret is `AUTH_SECRET` (the provider has none of its own). */
export function hashVerificationToken(token: string, secret: string): string {
  return createHash("sha256").update(`${token}${secret}`).digest("hex");
}

/** The Auth.js database-session cookie name, by whether the site runs over
 * https (`@auth/core` `defaultCookies`): unprefixed in dev, `__Secure-` in
 * production. The ONE definition — ./session.ts reads by these names, this
 * module writes by them, and the round-trip test pins them to Auth.js. */
export function sessionCookieName(secure: boolean): string {
  return `${secure ? "__Secure-" : ""}authjs.session-token`;
}

/** What the user types plus where the code was sent — the input to every
 * exchange call site (the /signin verify action, the review Post action). */
export interface SignInCodeInput {
  email: string;
  code: string;
}

/** The Auth.js session cookie for a database session: name and attributes
 * exactly as `@auth/core`'s `defaultCookies` sets them, expiring with the
 * session row (as the email callback route does). */
export function sessionCookie(
  sessionToken: string,
  expires: Date,
  secure: boolean,
): {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    sameSite: "lax";
    path: "/";
    secure: boolean;
    expires: Date;
  };
} {
  return {
    name: sessionCookieName(secure),
    value: sessionToken,
    options: { httpOnly: true, sameSite: "lax", path: "/", secure, expires },
  };
}

/**
 * Whether Auth.js would use the `__Secure-` cookie prefix for this request:
 * it keys off the request URL's protocol, which next-auth derives from
 * `AUTH_URL`/`NEXTAUTH_URL` when set and otherwise from `x-forwarded-proto`
 * (defaulting to https) — mirrored from `@auth/core`'s `createActionURL`.
 */
export function secureCookiesFor(
  requestHeaders: Headers,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const envUrl = env.AUTH_URL ?? env.NEXTAUTH_URL;
  if (envUrl) return new URL(envUrl).protocol === "https:";
  const proto = requestHeaders.get("x-forwarded-proto") ?? "https";
  return proto.replace(/:$/, "") === "https";
}

/** The seams the exchange runs against, injectable so the unit tests can pin
 * the contract without a database or a request. */
export interface ExchangeDeps {
  adapter: Adapter;
  /** `AUTH_SECRET` — the token-hash secret Auth.js used when minting. */
  secret: string;
  now?: () => Date;
  /** Auth.js's default `generateSessionToken` is `crypto.randomUUID`. */
  generateSessionToken?: () => string;
}

/**
 * The exchange proper, minus the cookie write: check the domain, look the code
 * up the way Auth.js would, resolve/create the identity, mint the session.
 * Returns the identity hash (what the caller attributes writes to) and the
 * session (what the caller sets as the cookie).
 */
export async function exchangeCode(
  input: SignInCodeInput,
  deps: ExchangeDeps,
): Promise<
  | { ok: true; identityHash: IdentityHash; session: { sessionToken: string; expires: Date } }
  | { ok: false; reason: ExchangeFailure }
> {
  const {
    adapter,
    secret,
    now = () => new Date(),
    generateSessionToken = randomUUID,
  } = deps;

  // 1. The Auburn gate — the same check the signIn callback applies on send.
  const email = normalizeEmail(input.email);
  if (!isAuburnStudentEmail(email)) return { ok: false, reason: "domain" };

  // 2. Shape: six digits (the grouped "123 456" display form is accepted). A
  //    malformed guess is rejected here without spending one of the adapter's
  //    counted attempts — it can't be a real code, so nothing is learned.
  const code = input.code.replace(/\D/g, "");
  if (code.length !== 6) return { ok: false, reason: "Verification" };

  // 3. Look the code up exactly as the Auth.js callback route does. The adapter
  //    is single-use (delete-and-return) and enforces the attempt cap; a miss
  //    of any kind is null. An expired-but-present token is a miss too — it
  //    has already been consumed by the lookup, as in Auth.js.
  const token = await adapter.useVerificationToken!({
    identifier: email,
    token: hashVerificationToken(code, secret),
  });
  if (!token || token.expires.valueOf() < now().valueOf()) {
    return { ok: false, reason: "Verification" };
  }

  // 4. Resolve or create the identity — hash-only, via the adapter — the same
  //    order Auth.js's `handleLoginOrRegister` follows for the email provider.
  const existing = await adapter.getUserByEmail!(email);
  const user =
    existing ??
    (await adapter.createUser!({ id: randomUUID(), email, emailVerified: now() }));

  // 5. Mint the session with Auth.js's defaults (random token, 30-day expiry).
  const session = await adapter.createSession!({
    sessionToken: generateSessionToken(),
    userId: user.id,
    expires: new Date(now().getTime() + SESSION_MAX_AGE_SECONDS * 1000),
  });

  return {
    ok: true,
    identityHash: computeIdentityHash(getPepper(), email),
    session: { sessionToken: session.sessionToken, expires: session.expires },
  };
}

/** The token-hash secret Auth.js is configured with (`AUTH_SECRET`, or the
 * legacy `NEXTAUTH_SECRET` next-auth also honours). Missing is a hard error:
 * without it no code could ever match, so fail loudly rather than generically. */
function authSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is not set. It is the secret Auth.js hashes sign-in codes with; the exchange cannot run without it. See .env.example.",
    );
  }
  return secret;
}

/**
 * Exchange a typed sign-in code for a session in the CURRENT request: on
 * success the session cookie is set on the response (the caller is then free
 * to redirect or to keep going — e.g. insert the review — with the user signed
 * in), and the author's `identity_hash` is returned. On failure nothing is
 * written and the caller gets the reason to render; no navigation happens.
 * Safe to call from Server Actions only (it writes a cookie).
 */
export async function exchangeCodeForSession(
  input: SignInCodeInput,
): Promise<ExchangeResult> {
  const result = await exchangeCode(input, {
    adapter: createHashingAdapter(),
    secret: authSecret(),
  });
  if (!result.ok) return result;

  const cookie = sessionCookie(
    result.session.sessionToken,
    result.session.expires,
    secureCookiesFor(await headers()),
  );
  (await cookies()).set(cookie.name, cookie.value, cookie.options);
  return { ok: true, identityHash: result.identityHash };
}
