# Runbook

Operator SQL for duties the v1 site has no console for (`docs/v1-spec.md` §12).
Run against Neon via the web SQL console or `psql`, substituting the
`:'param'` placeholders (psql `-v` variables) or editing them inline.

| Script | Duty |
| --- | --- |
| `takedown.sql` | Remove a reported review with a reason (§11.B). The author sees the reason on My Activity. |
| `contest-resolve.sql` | Uphold or reinstate a review the author contested (§11). |
| `purge-tombstones.sql` | Strip deleted/removed reviews past their retention window to a tombstone (§11). |

Retention windows live in `src/domain/activity.ts` (`RETENTION_DAYS`): ~30 days
after a self-delete, ~90 after a takedown — attorney-confirm before treating
as final (§10).
