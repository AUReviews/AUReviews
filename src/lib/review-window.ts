/**
 * The rolling term-window config, resolved (v1-spec §4; issue #24). §4 requires
 * the window be "an application config value (an env var or a single-row
 * settings table — not hardcoded)"; this is the env-var form. The pure domain
 * (`domain/review.ts`) stays config-free — it takes a mode and a date — so this
 * thin `lib` shell is the one place the env is read and the current date is
 * taken, keeping the window rule itself unit-testable without env or a clock.
 */
import { DEFAULT_TERM_WINDOW, type TermWindowMode, selectableTerms } from "@/domain";

/**
 * Read the configured window mode from `REVIEW_TERM_WINDOW`, defaulting to the
 * launch (4-year) setting v1 ships with (§4). An unset or unrecognized value
 * falls back to the default rather than throwing — a misconfigured env should
 * degrade to the safe wide window, never take the form down.
 */
export function reviewTermWindowMode(): TermWindowMode {
  const raw = process.env.REVIEW_TERM_WINDOW?.trim().toLowerCase();
  return raw === "steady" || raw === "launch" ? raw : DEFAULT_TERM_WINDOW;
}

/**
 * The terms the review form may offer right now: the configured window applied
 * to the current date (§4). Both the page (to render the dropdown) and the
 * submit action (to re-check the posted term against the live window) call this,
 * so a stale client can't slip in an out-of-window term.
 */
export function currentSelectableTerms(now: Date = new Date()) {
  return selectableTerms(now, reviewTermWindowMode());
}
