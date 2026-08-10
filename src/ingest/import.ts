/**
 * Ingest orchestrator (issue #18) — the glue that runs one COMP catalog import.
 *
 * fetch bulletin HTML → parse rows (ingest/catalog) → resolve against a snapshot
 * (domain/crosswalk) → apply the plan. Every side-effecting edge (network, DB
 * reads, DB writes) is injected as a dependency so the whole pipeline — including
 * idempotency and retire-not-delete — is testable without a live bulletin or a
 * real Postgres. The real edges are wired in `run.ts`.
 *
 * The seam direction holds: ingest imports the domain, never the reverse
 * (ADR 0002).
 */
import { type CatalogSnapshot, type IngestPlan, planIngest } from "@/domain";
import { parseCatalogHtml } from "./catalog";

/** The Auburn CSSE catalog lives entirely under the COMP prefix (§9; no SWEN). */
export const COMP_CATALOG_URL =
  "https://bulletin.auburn.edu/coursesofinstruction/comp/";

/** Injected side-effecting edges — real ones in run.ts, fakes in tests. */
export interface IngestDeps {
  /** Fetch the COMP catalog page HTML. */
  fetchHtml: () => Promise<string>;
  /** Read current catalog-side state for the crosswalk planner. */
  loadSnapshot: () => Promise<CatalogSnapshot>;
  /** Persist the resolved plan (idempotent). */
  applyPlan: (plan: IngestPlan) => Promise<void>;
  /** The catalog year these rows belong to (e.g. "2026-2027"). */
  catalogYear: string;
}

/** A compact, loggable summary of what one import did. */
export interface IngestSummary {
  parsed: number;
  created: number;
  updated: number;
  pending: number;
  retired: number;
}

/** Run one full import and return a summary of the plan that was applied. */
export async function runIngest(deps: IngestDeps): Promise<IngestSummary> {
  const html = await deps.fetchHtml();
  const rows = parseCatalogHtml(html);
  const snapshot = await deps.loadSnapshot();

  const plan = planIngest(rows, snapshot, { catalogYear: deps.catalogYear });
  await deps.applyPlan(plan);

  return {
    parsed: rows.length,
    created: plan.creates.length,
    updated: plan.applies.length,
    pending: plan.pendings.length,
    retired: plan.retirements.length,
  };
}
