/**
 * Offerings ingest entrypoint (issue #23).
 *
 * Wires the real edges — live Banner fetches and the Neon-backed offerings
 * layer — into the pure orchestrator, then runs one full Fall-2007-to-present
 * COMP import and logs a summary. Safe to re-run: idempotent, and only ever
 * touches offering-side state — never a Review, and never deletes a durable
 * Instructor (ADR 0002).
 *
 *   npm run ingest:offerings
 *
 * Run the catalog import first (`npm run ingest`) so the crosswalk can map
 * Banner's course codes onto durable Courses; Banner codes it can't map are
 * reported and skipped, never guessed. A full run makes ~60 spaced requests
 * and takes a couple of minutes.
 */
import { applyOfferingsPlan, loadOfferingsSnapshot } from "@/db/offerings";
import {
  fetchBannerTermListHtml,
  fetchBannerTermScheduleHtml,
} from "./fetch";
import { runOfferingsIngest } from "./import-offerings";

// Load .env.local for local runs (Node 24 built-in). On CI/Vercel the file is
// absent and the vars are injected directly, so a missing file is fine.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local — rely on the ambient environment.
}

async function main(): Promise<void> {
  const summary = await runOfferingsIngest({
    fetchTermListHtml: fetchBannerTermListHtml,
    fetchTermScheduleHtml: fetchBannerTermScheduleHtml,
    loadSnapshot: loadOfferingsSnapshot,
    applyPlan: applyOfferingsPlan,
  });

  console.log(
    `Offerings ingest complete: ${summary.terms} terms, ` +
      `${summary.offeringsSeen} offerings seen, ` +
      `${summary.offeringsCreated} created; instructors ` +
      `${summary.instructorsCreated} created, ` +
      `${summary.instructorsRenamed} renamed; links ` +
      `+${summary.linksAdded}/-${summary.linksRemoved}.`,
  );

  if (summary.pending > 0) {
    console.log(
      `${summary.pending} ambiguous instructor match(es) await an admin ` +
        `decision (instructor_pending) — none were auto-merged.`,
    );
  }

  if (summary.unmatchedCatalogKeys.length > 0) {
    console.log(
      `${summary.unmatchedCatalogKeys.length} Banner course(s) have no ` +
        `crosswalk mapping and were skipped: ` +
        summary.unmatchedCatalogKeys.join(", "),
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
