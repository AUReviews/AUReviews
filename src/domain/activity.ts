/**
 * Author-side review lifecycle rules (v1-spec §11/§13; issue #26) — the pure
 * core behind the My Activity page, the edit/delete actions, and "Contest this
 * removal". Like `moderation.ts`, this reads no env, DB, or request: the
 * server actions call these as the authoritative gate and the page reuses
 * them to decide which controls to render.
 *
 * A review's stored `status` is one of `published | pending | removed |
 * deleted` (schema.ts). The author sees three lifecycle states: `live` (on
 * the site, or queued behind the §12 panic switch — either way still theirs
 * to edit or delete), `removed` (an operator takedown, §11.B — the ONLY place
 * the author learns of it), and `deleted` (their own self-delete, still
 * recoverable by the operator inside the retention window).
 */
import { REPORT_REASONS } from "./moderation";

export type ReviewLifecycle = "live" | "removed" | "deleted";

/**
 * Retention windows (§11): soft-deleted content is kept for forensics and
 * appeals, then purged to a tombstone. ~30 days for a self-delete, ~90 for an
 * admin takedown. 🔴 attorney-confirm before treating as final (§10).
 */
export const RETENTION_DAYS = { deleted: 30, removed: 90 } as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Fold the stored status into what the author sees. An unrecognized status
 * is shown as removed rather than live: a review in an unknown state must
 * never be presented as editable or publicly visible. */
export function reviewLifecycle(status: string): ReviewLifecycle {
  switch (status) {
    case "published":
    case "pending":
      return "live";
    case "deleted":
      return "deleted";
    default:
      return "removed";
  }
}

/** Edit and self-delete apply only to a live review (§11 "author edit +
 * delete"): a removed one is the operator's call to contest, a deleted one is
 * already gone. */
export function canEditReview(status: string): boolean {
  return reviewLifecycle(status) === "live";
}

/** "Contest this removal" sets `contested=true` once (§11); the operator
 * resolves it manually (§12). A second press has nothing to add. */
export function canContestRemoval(review: {
  status: string;
  contested: boolean;
}): boolean {
  return reviewLifecycle(review.status) === "removed" && !review.contested;
}

/**
 * When a soft-deleted or removed review's content purges to its tombstone
 * (§11 retention), or `null` for a live review or one whose timestamp was
 * never stamped (the runbook's purge script skips those too).
 */
export function purgeDeadline(review: {
  status: string;
  deletedAt: Date | null;
  removedAt: Date | null;
}): Date | null {
  const lifecycle = reviewLifecycle(review.status);
  if (lifecycle === "live") return null;
  const since = lifecycle === "deleted" ? review.deletedAt : review.removedAt;
  if (!since) return null;
  return new Date(since.getTime() + RETENTION_DAYS[lifecycle] * DAY_MS);
}

const FALLBACK_REMOVAL_LABEL = "Removed for a guideline violation";

/**
 * The removal reason as the author reads it. The takedown runbook records
 * either a `REPORT_REASONS` category value (rendered by its published label)
 * or the operator's own words (shown verbatim); an empty reason still gets an
 * honest line rather than a blank.
 */
export function removalReasonLabel(reason: string | null): string {
  const trimmed = (reason ?? "").trim();
  if (!trimmed) return FALLBACK_REMOVAL_LABEL;
  return REPORT_REASONS.find((r) => r.value === trimmed)?.label ?? trimmed;
}
