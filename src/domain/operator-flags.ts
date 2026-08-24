/**
 * Break-glass operator flags (v1-spec §12; issue #28): the pure core behind
 * the two Vercel Global Config switches (the store formerly named Edge
 * Config) the solo operator can flip from a phone with no redeploy:
 *
 * - `moderationMode: "open" | "queue"`: the panic switch. `"queue"` flips new
 *   submissions' default `status` to `pending` (a full pre-publish gate) for a
 *   coordinated-abuse crisis; `"open"` is publish-on-submit (§4).
 * - `readOnly: boolean`: pauses new submissions while the catalog and all
 *   existing reviews stay served, the graceful-abandonment valve.
 *
 * Like the rest of this layer, no env, network, or Global Config client here:
 * `src/lib/operator-flags.ts` fetches the raw values and calls
 * {@link normalizeOperatorFlags}; the submit/edit actions consume the result.
 */

export interface OperatorFlags {
  moderationMode: "open" | "queue";
  readOnly: boolean;
}

/** The launch defaults (§12, launch checklist item 5): open, writable. */
export const DEFAULT_OPERATOR_FLAGS: OperatorFlags = {
  moderationMode: "open",
  readOnly: false,
};

/**
 * Fold whatever the Global Config store actually holds into typed flags. Each
 * flag is normalized independently, and anything unrecognized (a typo'd
 * value, a missing key, an unconfigured store) falls back to its default
 * rather than guessing: a bad edit from the dashboard must degrade to normal
 * operation, never to an unintended lockout (fail open, §12).
 */
export function normalizeOperatorFlags(raw: unknown): OperatorFlags {
  const obj =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  return {
    moderationMode: obj.moderationMode === "queue" ? "queue" : "open",
    readOnly: obj.readOnly === true,
  };
}

/** The statuses a brand-new review can be born with (§4/§12), shared with
 * the db layer's `NewReview` so the two can't drift. The other statuses
 * (`removed`, `deleted`) only ever arrive later, via runbook or self-delete. */
export type ReviewSubmitStatus = "published" | "pending";

/** What a brand-new review's `status` is at insert time (§4/§12): published
 * on submit in open mode, `pending` behind the panic switch. Existing rows
 * are never touched by a mode flip; only new inserts read this. */
export function initialReviewStatus(flags: OperatorFlags): ReviewSubmitStatus {
  return flags.moderationMode === "queue" ? "pending" : "published";
}

/** The one line shown wherever read-only mode blocks a write (§12): honest
 * about the pause, silent about the machinery. */
export const READ_ONLY_MESSAGE =
  "AUReviews is temporarily not accepting new or edited reviews. Everything already published stays up. Please try again later.";
