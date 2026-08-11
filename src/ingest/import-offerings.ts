/**
 * Offerings ingest orchestrator (issue #23) — the glue that runs one full
 * Banner import: fetch the live term dropdown → for each ingestible term
 * (Fall 2007 onward), fetch that term's COMP schedule and collapse its
 * sections to `(Course, Term)` rows → resolve everything against a snapshot
 * (domain/offerings) → apply the plan. Like the catalog import, every
 * side-effecting edge is injected so the pipeline — idempotency, pending
 * flags, never-delete-an-Instructor — is testable without live Banner or
 * Postgres. Real edges are wired in `run-offerings.ts`.
 *
 * The term list is read from the live dropdown on every run rather than
 * enumerated locally, so a new registration term appears in the ingest the
 * moment Banner publishes it (§9: the scheme was validated, not assumed).
 */
import {
  type IncomingOffering,
  type OfferingsPlan,
  type OfferingsSnapshot,
  collapseSections,
  isIngestibleTermCode,
  planOfferings,
} from "@/domain";
import { parseBannerSchedule, parseTermOptions } from "./banner";

/** Injected side-effecting edges — real ones in run-offerings.ts, fakes in tests. */
export interface OfferingsIngestDeps {
  /** Fetch the Banner term-dropdown page HTML. */
  fetchTermListHtml: () => Promise<string>;
  /** Fetch one term's full COMP schedule listing HTML. */
  fetchTermScheduleHtml: (termCode: string) => Promise<string>;
  /** Read current offering-side state for the planner. */
  loadSnapshot: () => Promise<OfferingsSnapshot>;
  /** Persist the resolved plan (idempotent). */
  applyPlan: (plan: OfferingsPlan) => Promise<void>;
}

/** A compact, loggable summary of what one offerings import did. */
export interface OfferingsIngestSummary {
  terms: number;
  offeringsSeen: number;
  offeringsCreated: number;
  instructorsCreated: number;
  instructorsRenamed: number;
  pending: number;
  linksAdded: number;
  linksRemoved: number;
  /** Banner course keys with no crosswalk mapping — skipped, for review. */
  unmatchedCatalogKeys: string[];
}

/** Run one full import and return a summary of the plan that was applied. */
export async function runOfferingsIngest(
  deps: OfferingsIngestDeps,
): Promise<OfferingsIngestSummary> {
  const termCodes = parseTermOptions(await deps.fetchTermListHtml())
    .map((o) => o.code)
    .filter(isIngestibleTermCode)
    .sort(); // chronological — fixed-width numeric codes sort correctly

  const rows: IncomingOffering[] = [];
  for (const termCode of termCodes) {
    const html = await deps.fetchTermScheduleHtml(termCode);
    rows.push(...collapseSections(termCode, parseBannerSchedule(html)));
  }

  const snapshot = await deps.loadSnapshot();
  const plan = planOfferings(rows, snapshot);
  await deps.applyPlan(plan);

  return {
    terms: termCodes.length,
    offeringsSeen: rows.length,
    offeringsCreated: plan.offeringCreates.length,
    instructorsCreated: plan.instructorCreates.length,
    instructorsRenamed: plan.instructorRenames.length,
    pending: plan.instructorPendings.length,
    linksAdded: plan.linkAdds.length,
    linksRemoved: plan.linkRemovals.length,
    unmatchedCatalogKeys: plan.unmatchedCatalogKeys,
  };
}
