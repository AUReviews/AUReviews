# AUReviews

Course reviews for Auburn undergrads, starting with Computer Science and Software Engineering.

Honest workload numbers — every review reports hours per week and difficulty, so you can build a
semester you'll actually survive.

## Status

**Building v1.** The buildable spec is [`docs/v1-spec.md`](docs/v1-spec.md), assembled from the
decisions charted on the [wayfinder map](https://github.com/AUReviews/AUReviews/issues/1) (now
closed). The design source is [`prototype/index.html`](prototype/index.html); research findings
backing the spec live under [`research/`](research).

The **walking skeleton** ([#17](https://github.com/AUReviews/AUReviews/issues/17)) is in place: a
single Next.js app that reads a row from Neon Postgres, with migration tooling, the one-way
`ingest/ → domain` seam, and an on-demand revalidation endpoint. Later tickets build on it.

## Developing

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest
npm run lint        # eslint (includes the ingest→domain boundary rule)
npm run dev         # local dev server (needs a database — see below)
```

Repo shape (v1-spec §8):

| Path | Role |
|---|---|
| `src/domain/` | Pure core — durable identities (ADR 0001). Imports nothing framework/DB. |
| `src/ingest/` | Catalog import seam. Imports `domain`, **never** the reverse (ADR 0002). |
| `src/db/` | Drizzle schema + Neon client (pooled endpoint at runtime). |
| `src/app/` | Next.js App Router: the DB-backed page + `/api/revalidate`. |
| `drizzle/` | Generated migrations (run against the Neon **direct** endpoint). |

Deploying to Vercel + provisioning Neon: [`docs/deploy.md`](docs/deploy.md).

Not affiliated with or endorsed by Auburn University.
