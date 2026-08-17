# The sign-in code exchange runs in-process, inside our server actions

Issue #43 replaced the magic link with a typed 6-digit **sign-in code** and settled that code entry "submits email + code to the existing Auth.js email callback — no hand-rolled exchange endpoint." That was the right don't-reinvent-the-library call while the only consumer was a standalone `/signin` page.

Issue #47 adds a constraint that route cannot meet. Posting a review must not require a sign-in round trip: a signed-out author types their Auburn email and code **inside the review form**, and Post must exchange the code for a session, resolve the identity, insert the review, and redirect to the course page — in **one server action, with no navigation before the redirect**. The Auth.js callback route is a navigation by construction (it answers with a redirect and sets the cookie on that response), so it cannot run inside `submitReview`.

We therefore moved the exchange step into `src/auth/exchange.ts` — `exchangeCodeForSession({ email, code })` — a **server-only module, not an HTTP endpoint** (zero new public surface). Both `/signin`'s verify action and `submitReview` call it.

## Considered Options

- **Keep posting to `/api/auth/callback/resend`** — the #43 decision. Rejected: it navigates. The review draft would have to survive a redirect to `/` (Auth.js's callback target) or be stashed client-side and replayed; and `/signin` keeps PR #46's known trade-off (a wrong code remounts the form and the address must be retyped).
- **A custom HTTP exchange endpoint** the client calls before submitting the review. Rejected: new public surface for the same reproduced internals, plus a two-request post (exchange, then insert) that can half-succeed.
- **In-process exchange module (chosen)** — reproduces exactly two Auth.js internals and leaves everything else with the library and our adapter.

## What the module reproduces, and what it does not

Reproduced (and pinned — see below):

1. **The verification-token hash** — `sha256(token + AUTH_SECRET)` as hex, so the adapter lookup matches what Auth.js's `sendToken` stored.
2. **The session-cookie contract** — `authjs.session-token` in dev / `__Secure-authjs.session-token` over https; httpOnly, sameSite=lax, path=/, expiring with the session — so `useSession`, `/api/auth/session`, and `signOut` see the session exactly as if the callback route had set it.

Not reproduced — still owned by the adapter (`src/auth/adapter.ts`) and Auth.js:

- token minting, secret-hashed storage, and delivery (`signIn("resend")` → `sendVerificationRequest`), behind the send rate limits enforced in the sign-in action;
- single-use delete-and-return, the 5-attempt cap, and the peppered token identifier (`useVerificationToken`);
- the hash-only identity (`getUserByEmail` / `createUser`) and the database session (`createSession`, default 30-day expiry, `crypto.randomUUID` token);
- `signOut`, `useSession`, the `/api/auth/*` handlers, and the `session` callback that strips anything identifying.

The Auburn-domain gate is applied on send (Auth.js `signIn` callback) **and** in the exchange, unchanged.

## Consequences

- **Drift guard.** `src/auth/exchange.roundtrip.test.ts` mints a code through the real `signIn("resend")` path (mailer mocked to capture the code), exchanges it via `exchangeCodeForSession`, and reads the session back through the real Auth.js session route using only the cookie we set. If Auth.js ever changes its token hashing or cookie naming, that test fails loudly instead of every sign-in silently breaking. `exchange.test.ts` pins the contract unit by unit.
- **`/signin` no longer navigates on a wrong code.** The verify action returns state; the form stays mounted with the address still typed in. PR #46's trade-off is gone.
- **Signing in is a side effect of posting.** `submitReview` runs the exchange after the review has passed every check and right before the insert, so a rejected draft never spends the code.
- **`/api/auth/callback/resend` keeps existing** (Auth.js registers it); our UI just stops posting to it. Nothing depends on it, and nothing new is exposed.
- **One shared component** (`SignInCodeFields`) renders the email/code block on both surfaces, so the domain check, rate-limit copy, and error copy have one code path; a wrong / expired / exhausted code is one generic message everywhere.
- Auth.js remains the auth system; only the exchange step is ours. This supersedes the "no hand-rolled exchange endpoint" line of the #43 brief for the exchange step only.
