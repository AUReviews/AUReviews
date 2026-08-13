/**
 * Review submission core (v1-spec §4/§11; issue #24) — the pure, framework- and
 * persistence-agnostic rules behind the review form. This is the single source
 * of truth for both surfaces the spec demands:
 *
 *   1. the form's *live inline door-blocks* — the client island imports these
 *      functions to bounce a submission back before Submit is ever clickable
 *      (§11.A: "before Submit is clickable, never after"); and
 *   2. the *authoritative* re-check in the submit/edit server action, so a
 *      hand-crafted POST or a bait-and-switch edit can't ride past the filters
 *      (§11: "editing re-runs the full submit pipeline").
 *
 * Because both call the exact same code, the live UI and the server can never
 * disagree about what is submittable. It reads no env, DB, or request — the
 * rolling-window mode and the current date are passed in (the `lib` layer reads
 * the env config and hands them down).
 */
import { type Semester, type Term, formatTerm, recentTerms } from "./term";
import { SLUR_BLOCKLIST } from "./blocklist";

/** §4: the body's hard 100-character minimum (counted on trimmed text). */
export const BODY_MIN_LENGTH = 100;

/**
 * The rolling term-window mode (§4), an application config value (env var /
 * settings row — never hardcoded at the call site). `launch` opens the past 4
 * years (~12 terms) to seed the review pool with current students and recent
 * alumni; `steady` rolls down to the last 3 semesters once the seed wave passes.
 */
export type TermWindowMode = "launch" | "steady";

/** How many recent terms each window mode makes selectable (§4). */
export const TERM_WINDOW_COUNTS: Record<TermWindowMode, number> = {
  launch: 12,
  steady: 3,
};

/** v1 ships defaulting to the launch (4-year) window (§4). */
export const DEFAULT_TERM_WINDOW: TermWindowMode = "launch";

/** A term offered in the dropdown: the {@link Term} plus its `Fall 2026` label. */
export interface SelectableTerm {
  code: string;
  semester: Semester;
  year: number;
  label: string;
}

/**
 * The terms the dropdown offers for a given `date` and window `mode` (§4),
 * newest first. The window governs only what can be *selected* at submit time;
 * a review's stored term persists and displays regardless of the window.
 */
export function selectableTerms(
  date: Date,
  mode: TermWindowMode,
): SelectableTerm[] {
  return recentTerms(date, TERM_WINDOW_COUNTS[mode]).map(toSelectable);
}

function toSelectable(term: Term): SelectableTerm {
  return {
    code: term.code,
    semester: term.semester,
    year: term.year,
    label: formatTerm(term),
  };
}

/**
 * The instructor field's resolved value (§4). It is *required*, but resolves to
 * either a real instructor id or one of two explicit unknowns — an explicit
 * unknown beats a bare null, and it keeps the curated by-instructor breakdown
 * (§7) honest.
 */
export type InstructorChoice =
  | { kind: "instructor"; id: string }
  | { kind: "not-listed" }
  | { kind: "dont-remember" };

/** The two escape-hatch tokens persisted in `reviews.instructor_unknown`. */
export const INSTRUCTOR_UNKNOWN_VALUES = ["not-listed", "dont-remember"] as const;
export type InstructorUnknown = (typeof INSTRUCTOR_UNKNOWN_VALUES)[number];

/** A helpful-vote direction (§4/§5). A live vote is exactly one of these —
 * never a bare boolean — and per-voter votes are retractable/flippable. */
export type VoteDirection = "up" | "down";

/**
 * Resolve a raw dropdown value into an {@link InstructorChoice}, or `null` when
 * nothing valid is selected (the empty placeholder). The two sentinels are the
 * escape hatches; anything else is treated as an instructor id — the caller has
 * already scoped the option list to the course, so an id here is course-valid.
 */
export function parseInstructorChoice(value: string | null): InstructorChoice | null {
  if (!value) return null;
  if (value === "not-listed") return { kind: "not-listed" };
  if (value === "dont-remember") return { kind: "dont-remember" };
  return { kind: "instructor", id: value };
}

/** A door-block: a hard rejection that must clear before Submit is enabled. */
export type DoorBlockCode =
  | "too-short"
  | "contains-url"
  | "contains-contact"
  | "blocklisted-term";

export interface DoorBlock {
  code: DoorBlockCode;
  message: string;
}

// A link: an explicit scheme/`www.`, OR a bare host that ends in a known TLD.
// The bare-host arm is what catches `google.com/x` without an `http://`; the TLD
// allowlist keeps it from firing on ordinary "e.g." / "3.5" / "U.S." prose.
const URL_RE =
  /(?:https?:\/\/|www\.)\S+|\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.(?:com|net|org|edu|gov|io|co|us|gg|xyz|info|dev|app|me|ly|be|tv|link)\b/i;
// An email address — the most common self-doxx / contact vector.
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
// A US-style 10-digit phone number, tolerant of `()`/`-`/`.`/space grouping and
// an optional country code. Requires the full 10-digit shape so a workload
// range like "10-15 hours" or a term year never trips it. The leading
// `(?<!\d)` and trailing `\b` pin it to a standalone number, so a 10-digit run
// buried inside a longer id doesn't hard-block as contact info.
const PHONE_RE = /(?<!\d)(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/;

// Whole-word, case-insensitive blocklist match. Built once from the term list.
const BLOCKLIST_RE = new RegExp(
  `\\b(?:${SLUR_BLOCKLIST.map(escapeRegExp).join("|")})\\b`,
  "i",
);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The door (§11.A): every hard-block a review body must clear, evaluated live.
 * Returns one {@link DoorBlock} per triggered rule (deduplicated by code),
 * empty when the body is clean. Order is stable — length first, then link,
 * contact, blocklist — so the form surfaces the most actionable message first.
 * The 100-char minimum counts trimmed text so trailing whitespace can't pad it.
 */
export function checkReviewBody(body: string): DoorBlock[] {
  const blocks: DoorBlock[] = [];
  const trimmed = body.trim();

  if (trimmed.length < BODY_MIN_LENGTH) {
    blocks.push({
      code: "too-short",
      message: `Add ${BODY_MIN_LENGTH - trimmed.length} more character${
        BODY_MIN_LENGTH - trimmed.length === 1 ? "" : "s"
      } — reviews need at least ${BODY_MIN_LENGTH}.`,
    });
  }
  if (URL_RE.test(body)) {
    blocks.push({
      code: "contains-url",
      message: "Remove links or web addresses — they aren't allowed in reviews.",
    });
  }
  if (EMAIL_RE.test(body) || PHONE_RE.test(body)) {
    blocks.push({
      code: "contains-contact",
      message: "Remove contact details like emails or phone numbers.",
    });
  }
  if (BLOCKLIST_RE.test(body)) {
    blocks.push({
      code: "blocklisted-term",
      message:
        "This review contains a slur or protected-characteristic term and can't be posted.",
    });
  }
  return blocks;
}

/** The user-entered required-core fields, before validation. */
export interface ReviewCoreInput {
  overall: number | null;
  difficulty: number | null;
  workloadHours: number | null;
  termCode: string | null;
  instructor: InstructorChoice | null;
  body: string;
}

/** A single field-level rejection, keyed to the field it belongs to. */
export interface ReviewFieldError {
  field: "overall" | "difficulty" | "workloadHours" | "termCode" | "instructor" | "body";
  message: string;
}

function isIntInRange(v: number | null, min: number, max: number): boolean {
  return v !== null && Number.isInteger(v) && v >= min && v <= max;
}

/**
 * Validate the required core (§4) plus the body door-blocks (§11) — the full
 * gate that decides whether Submit may fire. Returns every reason it can't, so
 * the form can mark each field at once; an empty array means submittable.
 *
 * `selectableTermCodes` is the current rolling window (§4): the term must be one
 * the window still offers, so a stale client can't submit an out-of-window term.
 * The optional "Course details" zone is intentionally absent — nothing there can
 * ever block submission (§4).
 */
export function validateReviewCore(
  input: ReviewCoreInput,
  { selectableTermCodes }: { selectableTermCodes: readonly string[] },
): ReviewFieldError[] {
  const errors: ReviewFieldError[] = [];

  if (!isIntInRange(input.overall, 1, 5)) {
    errors.push({ field: "overall", message: "Choose an overall rating from 1 to 5." });
  }
  if (!isIntInRange(input.difficulty, 1, 5)) {
    errors.push({ field: "difficulty", message: "Choose a difficulty from 1 to 5." });
  }
  if (!isIntInRange(input.workloadHours, 1, 40)) {
    errors.push({
      field: "workloadHours",
      message: "Enter typical hours per week as a whole number from 1 to 40.",
    });
  }
  if (!input.termCode || !selectableTermCodes.includes(input.termCode)) {
    errors.push({ field: "termCode", message: "Choose the term you took this course." });
  }
  if (!input.instructor) {
    errors.push({ field: "instructor", message: "Choose an instructor, or an unknown option." });
  }
  for (const block of checkReviewBody(input.body)) {
    errors.push({ field: "body", message: block.message });
  }

  return errors;
}

/** Convenience predicate: is this submission clear to post? (§11's door.) */
export function canSubmitReview(
  input: ReviewCoreInput,
  opts: { selectableTermCodes: readonly string[] },
): boolean {
  return validateReviewCore(input, opts).length === 0;
}

// The optional "Course details" zone (§4). These lists are the ALLOWED values —
// shared by the form (to render the controls) and the submit action (to sanitize
// what's posted). Nothing here can block submission (§4); the action simply
// drops any value not on its list rather than rejecting, so a stale or hostile
// client can't inject junk into an optional column but also can't stall a valid
// review.
export const WORKLOAD_SHAPE_OPTIONS = [
  "Steady grind",
  "Project spikes",
  "Front-loaded",
  "Back-loaded",
  "Heavy reading",
  "Exam-crammable",
] as const;

export const GRADE_OPTIONS = [
  "A",
  "B",
  "C",
  "D",
  "F",
  "Pass",
  "Fail",
  "Withdrew",
] as const;

export const LANGUAGE_OPTIONS = [
  "Java",
  "C",
  "C++",
  "Python",
  "C#",
  "JS/TS",
  "SQL",
  "Assembly",
  "Other",
  "No programming",
] as const;

export const CURVED_OPTIONS = ["Curved up", "Not curved"] as const;
export const ATTENDANCE_OPTIONS = ["Mandatory", "Recommended", "Not needed"] as const;
export const PREP_OPTIONS = ["Well prepared", "Somewhat", "Underprepared"] as const;

/** Keep only the posted values that are on the allowed list, order preserved. */
export function sanitizeMultiSelect(
  values: readonly string[],
  allowed: readonly string[],
): string[] {
  const set = new Set(allowed);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (set.has(v) && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/** The posted value if it is on the allowed list, else `null` (never blocks). */
export function sanitizeSingleSelect(
  value: string | null | undefined,
  allowed: readonly string[],
): string | null {
  return value && allowed.includes(value) ? value : null;
}
