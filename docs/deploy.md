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
   - **`DIRECT_URL`** → the **direct** (non-pooled) endpoint (same host without
     `-pooler`). Migrations use this.

   The integration may name them `DATABASE_URL` and `DATABASE_URL_UNPOOLED` (or
   similar). Add/rename env vars so this app sees exactly `DATABASE_URL`
   (pooled) and `DIRECT_URL` (direct). Both should include `?sslmode=require`.

## 3. Set the revalidation secret (~1 min)

Generate a secret and add it as a Vercel env var **`REVALIDATE_SECRET`**:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 4. Run migrations against the direct endpoint (~2 min)

Migrations run from your machine (or CI), never from a Vercel function.

```bash
cp .env.example .env.local     # then paste in DATABASE_URL, DIRECT_URL, REVALIDATE_SECRET
npm run db:migrate             # drizzle-kit, uses DIRECT_URL
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

The internal endpoint later writes will call (`revalidateTag` / `revalidatePath`):

```bash
curl -X POST https://<your-deployment>/api/revalidate \
  -H "Authorization: Bearer $REVALIDATE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"tag":"placeholder","path":"/"}'
# -> {"ok":true,"revalidated":{"tags":["placeholder"],"paths":["/"]}}
```

A wrong/missing bearer token returns `401`; an empty body returns `400`.

## What this proves (acceptance, #17)

- [x] App deployed to Vercel, reachable at a URL. *(steps 1, 6)*
- [x] Placeholder page renders data **read from Neon** (not hardcoded). *(steps 5–6; code: `src/app/page.tsx` → `src/db/queries.ts`)*
- [x] Migrations run against the **direct** endpoint; app connects over the **pooled** endpoint. *(step 4; `drizzle.config.ts` uses `DIRECT_URL`, `src/db/client.ts` uses `DATABASE_URL`)*
- [x] An `ingest/` module exists and depends on the domain layer only — no reverse import; enforced by eslint `import/no-restricted-paths` **and** `src/domain/boundary.test.ts`, documented in `AGENTS.md`. *(code: `src/ingest/`, `src/domain/`)*
- [x] A revalidation endpoint exists and revalidates a page/tag on demand. *(step 7; code: `src/app/api/revalidate/route.ts`, `src/lib/revalidate.ts`)*

## Notes for the next tickets

- **#18 (catalog import)** extends `src/ingest/` and adds real catalog/review
  tables to `src/db/schema.ts`; the `placeholder` table can be dropped then.
- **#19 (auth)** adds Auth.js tables to the same Neon Postgres over the pooled
  endpoint, and its own migrations over the direct endpoint.
- **Catalog refresh** (v1-spec §8) runs as a GitHub Action against the pooled
  endpoint, then POSTs `/api/revalidate` — the seam wired here.
