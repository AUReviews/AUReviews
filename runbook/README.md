# Runbook

Operator SQL for duties the v1 site has no console for (`docs/v1-spec.md` §12).
Run against Neon via the web SQL console or `psql`, substituting the
`:'param'` placeholders (psql `-v` variables) or editing them inline.

| Script | Duty |
| --- | --- |
| `takedown.sql` | Remove a reported review with a reason (§11.B). The author sees the reason on My Activity. |
| `contest-resolve.sql` | Uphold or reinstate a review the author contested (§11). |
| `purge-tombstones.sql` | Strip deleted/removed reviews past their retention window to a tombstone (§11). |
| `crosswalk-accept.sql` | Map a pending ambiguous catalog key onto the candidate Course it renumbers (ADR 0002). |
| `crosswalk-reject.sql` | The pending match was a coincidence: mint the key's genuinely-new Course instead. |
| `instructor-merge.sql` | Merge two Instructor rows that are the same person, repointing Offerings/Reviews. |
| `queue-release.sql` | Publish reviews held `pending` by the panic switch, once the crisis passes. |

The other §12 break-glass lever is the pair of Vercel Global Config flags
(the store formerly named Edge Config): `moderationMode: "open" | "queue"`
(panic switch: hold new reviews as `pending`) and `readOnly: true | false`
(pause new/edited reviews). They flip from the Vercel dashboard (Storage →
the store's Items tab), no redeploy, live in seconds. Defaults: `"open"`,
`false`. Read via `src/lib/operator-flags.ts`; anything malformed or
unreachable falls back to those defaults.

Retention windows live in `src/domain/activity.ts` (`RETENTION_DAYS`): ~30 days
after a self-delete, ~90 after a takedown — attorney-confirm before treating
as final (§10).
