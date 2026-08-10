# Deploy: the walking skeleton (Vercel + Neon)

This is the [#17](https://github.com/AUReviews/AUReviews/issues/17) walking skeleton —
a single Next.js app on **Vercel Hobby** reading from **Neon Postgres**
(v1-spec [§8](v1-spec.md#8-stack-hosting-and-rendering)). The code is in the
repo and builds locally; the steps below are the ones that need a browser and an
account, so a human runs them once. Times are rough.

## Prerequisites

- A GitHub repo (`AUReviews/AUReviews`) — already exists.
- A Vercel account and a Neon account (both free tiers).
- Local: `npm install` (Node 24+).

## 1. Import the repo into Vercel (~3 min)

1. Vercel dashboard → **Add New… → Project** → import `AUReviews/AUReviews`.
2. Framework preset auto-detects **Next.js**. Leave build/output settings default.
3. Don't deploy yet — add the database first (next step), or deploy now and
   redeploy after env vars are set. Either works.

## 2. Provision Neon via the Vercel–Neon integration (~3 min)

1. In the Vercel project → **Storage** tab → **Create Database → Neon** (the
   native integration). Follow the prompts; pick the region closest to the
   Vercel function region.
2. The integration writes the connection strings into the project's environment
   variables automatically. You need two of them, mapped to the names this app
   uses:
   - **`DATABASE_URL`** → the **pooled** endpoint (host contains `-pooler`). The
     app and Auth.js use this at runtime.
   - **`DATABASE_URL_UNPOOLED`** → the **direct** (non-pooled) endpoint (same
     host without `-pooler`). Migrations use this.

   The Vercel–Neon integration emits both of these names directly, so no
   renaming is needed. Both should include `?sslmode=require`.

## 3. Set the revalidation secret (~1 min)

Generate a secret and add it as a Vercel env var **`REVALIDATE_SECRET`**:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 4. Run migrations against the direct endpoint (~2 min)

Migrations run from your machine (or CI), never from a Vercel function.

```bash
cp .env.example .env.local     # then paste in DATABASE_URL, DATABASE_URL_UNPOOLED, REVALIDATE_SECRET
npm run db:migrate             # drizzle-kit, uses DATABASE_URL_UNPOOLED
```

This creates the `placeholder` table (`drizzle/0000_init.sql`).

## 5. Seed the proof-of-life row (~1 min)

```bash
npm run db:seed                # inserts one row over the pooled endpoint; idempotent
```

Alternatively, run the same `INSERT` in Neon's web SQL console.

## 6. Deploy / redeploy (~2 min)

Push to `main` (or hit **Redeploy** in Vercel). When the deploy finishes, open
the URL: the homepage renders the seeded line **read live from Neon**. Before
seeding it shows a "table is empty — run the seed" message; before Neon is
reachable it shows a "not provisioned yet" message with the underlying error.

## 7. Verify on-demand revalidation (~1 min)

The internal endpoint later writes will call (`revalidateTag` / `revalidatePath`).

**bash / macOS / Linux:**

```bash
curl -X POST https://<your-deployment>/api/revalidate \
  -H "Authorization: Bearer $REVALIDATE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"tag":"placeholder","path":"/"}'
# -> {"ok":true,"revalidated":{"tags":["placeholder"],"paths":["/"]}}
```

**Windows PowerShell** (`curl` there is an alias for `Invoke-WebRequest` and
won't take the flags above — use `Invoke-RestMethod`; this reads the secret
straight from `.env.local`):

```powershell
$secret = ((Get-Content .env.local | Where-Object { $_ -match '^REVALIDATE_SECRET=' }) -replace '^REVALIDATE_SECRET=', '').Trim('"')
$url = "https://<your-deployment>/api/revalidate"
Invoke-RestMethod -Method Post -Uri $url `
  -Headers @{ Authorization = "Bearer $secret" } `
  -ContentType "application/json" `
  -Body '{"tag":"placeholder","path":"/"}'
# -> ok = True; revalidated = @{tags=...; paths=...}
```

A wrong/missing bearer token returns `401`; an empty body returns `400` (in
PowerShell these surface as a thrown "response status code does not indicate
success" error — that is the expected rejection). The secret in `.env.local`
must match the `REVALIDATE_SECRET` set in Vercel, or the call returns `401`.

## 8. Auth: @auburn.edu magic-link ([#19](https://github.com/AUReviews/AUReviews/issues/19))

Auth.js (NextAuth) self-hosted, owning its tables in the same Neon Postgres
(v1-spec [§7](v1-spec.md#7-auth-identity-and-anonymity)). Migrations in step 4
create the `identities`, `sessions`, `verification_tokens`, and `email_send_log`
tables (`drizzle/0002_*.sql`).

**Env vars to add in Vercel** (and to `.env.local` for local dev — see
`.env.example`):

- **`AUTH_SECRET`** — Auth.js cookie/session encryption key. Generate with
  `npx auth secret`.
- **`PEPPER`** — the HMAC key for `identity_hash`. Generate with
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
  It **must live only here, never in the database** (v1-spec §7) — it is the one
  secret that keeps `identity_hash` non-reversible. Rotating it orphans every
  existing identity (they can no longer be re-derived from a re-verified email),
  so treat it like a private key.
- **`RESEND_API_KEY`** — Resend API key. When unset (local dev), magic links are
  logged to the server console instead of emailed, so the flow is testable
  without a mailbox.
- **`EMAIL_FROM`** — from-address on the dedicated sending subdomain, e.g.
  `AUReviews <no-reply@mail.aureviews.com>`.

**DNS (launch-checklist item, not code — v1-spec §7):** deliverability into
Auburn's Microsoft 365 tenant requires **SPF + DKIM + DMARC** published on the
Resend sending subdomain. Verify the domain in Resend, publish the records it
generates, and confirm a test link lands in an Auburn inbox (not Junk) **before**
opening the review-submission flow.

**What's enforced in code** (`src/auth/`): non-Auburn addresses are rejected at
sign-in before any email is sent; each magic link is single-use and expires in
~30 min with only one live token per address; send rate limits are ≤3/address/hr
and ≤10/IP/hr; only `identity_hash` + `verified_at` are stored (never the email);
and the client session exposes neither the hash nor the address.

## What this proves (acceptance, #17)

- [x] App deployed to Vercel, reachable at a URL. *(steps 1, 6)*
- [x] Placeholder page renders data **read from Neon** (not hardcoded). *(steps 5–6; code: `src/app/page.tsx` → `src/db/queries.ts`)*
- [x] Migrations run against the **direct** endpoint; app connects over the **pooled** endpoint. *(step 4; `drizzle.config.ts` uses `DATABASE_URL_UNPOOLED`, `src/db/client.ts` uses `DATABASE_URL`)*
- [x] An `ingest/` module exists and depends on the domain layer only — no reverse import; enforced by eslint `import/no-restricted-paths` **and** `src/domain/boundary.test.ts`, documented in `AGENTS.md`. *(code: `src/ingest/`, `src/domain/`)*
- [x] A revalidation endpoint exists and revalidates a page/tag on demand. *(step 7; code: `src/app/api/revalidate/route.ts`, `src/lib/revalidate.ts`)*

## Notes for the next tickets

- **#18 (catalog import)** extends `src/ingest/` and adds real catalog/review
  tables to `src/db/schema.ts`; the `placeholder` table can be dropped then.
- **#19 (auth)** — done; see section 8 above. Auth.js tables live in the same
  Neon Postgres (pooled endpoint at runtime, direct endpoint for its migrations).
- **Catalog refresh** (v1-spec §8) runs as a GitHub Action against the pooled
  endpoint, then POSTs `/api/revalidate` — the seam wired here.
