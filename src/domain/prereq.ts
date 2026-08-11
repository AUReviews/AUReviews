/**
 * Prerequisite prose parser (v1-spec §6/§9; issue #22).
 *
 * Auburn publishes prerequisites as semi-structured prose following a regular
 * `Pr.`/`Coreq.` grammar — course tokens (`COMP 2210`), boolean `and`/`or`/`&`,
 * parenthetical grouping, grade thresholds (`with a grade of C or higher`), and
 * cross-department tokens (`ELEC 2220`). This module is the custom parser the
 * spec accepts as a cost: it turns that prose into **structured prerequisite
 * edges** the course page renders as clickable chips.
 *
 * Two hard rules from the spec shape the design:
 *  - **Never drop information.** A clause the parser cannot confidently structure
 *    falls back to its verbatim prose ({@link PrereqRequirement.fallback}); the
 *    page shows the original text rather than a lossy half-parse.
 *  - **Unlocks is the true inverse of Prerequisites.** The graph is derived, not
 *    hand-maintained: {@link prerequisiteEdges} is the single definition of "what
 *    courses does this one require", and the inverse (who requires *this* course)
 *    is computed from it over the whole catalog by the caller (`lib/prereqs.ts`).
 *
 * Pure and dependency-free — no framework, no persistence — so the grammar is
 * exhaustively unit-testable against real bulletin samples (see prereq.test.ts).
 */

/** A course reference lifted from prereq prose, with the grade threshold (if any)
 * that governed it. `subject`/`number` are upper-cased; cross-department refs
 * (e.g. `ELEC 2220`) are kept verbatim — the parser never assumes COMP-only. */
export interface PrereqCourseRef {
  subject: string;
  number: string;
  /** Minimum grade required, e.g. "C" from "with a grade of C or higher". */
  grade: string | null;
}

/** A disjunction: alternatives any one of which satisfies the requirement. A
 * plain required course is a group of length 1. */
export interface PrereqGroup {
  alternatives: PrereqCourseRef[];
}

export type PrereqRelation = "prerequisite" | "corequisite";

/**
 * One parsed `Pr.`/`Coreq.` clause. When the clause structured cleanly, `groups`
 * is its conjunction of {@link PrereqGroup}s (AND of ORs) and `fallback` is null.
 * When it did not, `groups` is empty and `fallback` carries the verbatim clause
 * so nothing is lost.
 */
export interface PrereqRequirement {
  relation: PrereqRelation;
  groups: PrereqGroup[];
  fallback: string | null;
}

export interface ParsedPrereqs {
  requirements: PrereqRequirement[];
  /** True when at least one clause produced structured groups (chips to show). */
  structured: boolean;
}

/** Normalize a ref to a comparable catalog code key: `COMP 2210`. */
export function prereqCodeKey(ref: { subject: string; number: string }): string {
  return `${ref.subject.trim().toUpperCase()} ${ref.number.trim().toUpperCase()}`;
}

// One clause = a `Pr.`/`Coreq.` marker through the first sentence-terminating
// period. Course tokens, grouping, and grade phrases contain no periods, so the
// body (`[^.]*`) stops exactly at the clause end.
const CLAUSE_RE = /(Pr\.|Coreq\.)([^.]*)\./g;

// A trailing grade threshold, optionally introduced by a comma and/or "both".
// Stripped BEFORE tokenizing so its "or higher" is never mistaken for a boolean.
const GRADE_RE =
  /\s*,?\s*(?:both\s+)?with a (?:minimum )?grade of ([A-D][+-]?)(?:\s+or higher)?/i;

/** Parse the whole `prereqText` into structured (or verbatim-fallback) clauses. */
export function parsePrereqs(prereqText: string | null): ParsedPrereqs {
  const text = prereqText?.trim();
  if (!text) return { requirements: [], structured: false };

  const requirements: PrereqRequirement[] = [];
  for (const match of text.matchAll(CLAUSE_RE)) {
    const relation: PrereqRelation =
      match[1] === "Coreq." ? "corequisite" : "prerequisite";
    const verbatim = match[0].trim();
    const groups = parseClauseBody(match[2]);
    if (groups) {
      requirements.push({ relation, groups, fallback: null });
    } else {
      requirements.push({ relation, groups: [], fallback: verbatim });
    }
  }

  const merged = mergeGradeRestatements(requirements);
  const structured = merged.some((r) => r.groups.length > 0);
  return { requirements: merged, structured };
}

/**
 * The prerequisite edge set for one course: the distinct courses it requires,
 * corequisites excluded. This is the ONE definition of a prerequisite edge — the
 * course page renders it as "Prerequisites" chips, and every other course's
 * "Unlocks" list is the inverse of this same relation (issue #22, §6).
 *
 * Edges are extracted even from a clause that fell back to verbatim prose (via a
 * token scan) so the inverse graph stays complete when the full boolean parse
 * couldn't — a code is a valid edge whether or not its surrounding logic parsed.
 */
export function prerequisiteEdges(prereqText: string | null): PrereqCourseRef[] {
  const parsed = parsePrereqs(prereqText);
  const refs: PrereqCourseRef[] = [];
  for (const req of parsed.requirements) {
    if (req.relation !== "prerequisite") continue;
    if (req.groups.length > 0) {
      for (const group of req.groups) refs.push(...group.alternatives);
    } else if (req.fallback) {
      refs.push(...scanCourseRefs(req.fallback));
    }
  }
  return dedupeByCode(refs);
}

// ---------------------------------------------------------------------------
// Clause parsing
// ---------------------------------------------------------------------------

/**
 * Parse a clause body into a conjunction of OR-groups, or `null` if it contains
 * anything the grammar doesn't recognize (→ the caller keeps it as verbatim
 * prose). A grade threshold is stripped first and applied to every course in the
 * clause, matching the bulletin's "…both with a grade of C or higher" phrasing.
 */
function parseClauseBody(rawBody: string): PrereqGroup[] | null {
  const gradeMatch = GRADE_RE.exec(rawBody);
  const grade = gradeMatch ? gradeMatch[1].toUpperCase() : null;
  const body = gradeMatch ? rawBody.replace(GRADE_RE, " ") : rawBody;

  const tokens = tokenize(body);
  if (!tokens || tokens.length === 0) return null;

  const parser = new ClauseParser(tokens);
  const groups = parser.parseExpr();
  if (groups === null || !parser.atEnd()) return null;

  if (grade) {
    for (const group of groups) {
      for (const ref of group.alternatives) ref.grade = grade;
    }
  }
  return groups;
}

type Token =
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "and" }
  | { type: "or" }
  | { type: "course"; subject: string; number: string }
  | { type: "number"; number: string };

const KEYWORD_RE = /^(and|or)\b/i;
const COURSE_RE = /^([A-Za-z]{2,4})\s+(\d{3,4}[A-Za-z]?)/;
const NUMBER_RE = /^(\d{3,4}[A-Za-z]?)/;

/** Scan a clause body into tokens, or `null` at the first unrecognized char. */
function tokenize(body: string): Token[] | null {
  const tokens: Token[] = [];
  let rest = body;

  while (rest.length > 0) {
    const ch = rest[0];
    if (/\s/.test(ch)) {
      rest = rest.slice(1);
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "lparen" });
      rest = rest.slice(1);
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "rparen" });
      rest = rest.slice(1);
      continue;
    }
    // `&` and `,` both read as conjunction (`COMP 2210 & 2240`, comma lists).
    if (ch === "&" || ch === ",") {
      tokens.push({ type: "and" });
      rest = rest.slice(1);
      continue;
    }
    // Keywords BEFORE course/number so `and 2240` is a conjunction, never a
    // course token with subject "and".
    const keyword = KEYWORD_RE.exec(rest);
    if (keyword) {
      tokens.push({ type: keyword[1].toLowerCase() === "and" ? "and" : "or" });
      rest = rest.slice(keyword[0].length);
      continue;
    }
    const course = COURSE_RE.exec(rest);
    if (course) {
      tokens.push({
        type: "course",
        subject: course[1].toUpperCase(),
        number: course[2].toUpperCase(),
      });
      rest = rest.slice(course[0].length);
      continue;
    }
    const number = NUMBER_RE.exec(rest);
    if (number) {
      tokens.push({ type: "number", number: number[1].toUpperCase() });
      rest = rest.slice(number[0].length);
      continue;
    }
    return null; // unrecognized prose — the clause falls back to verbatim
  }
  return tokens;
}

/**
 * Recursive-descent parser producing conjunctive normal form:
 *   expr   := term (AND term)*        — conjunction, concatenates groups
 *   term   := factor (OR factor)*     — disjunction, one OR-group
 *   factor := '(' expr ')' | course
 *
 * A bare number inherits the most recent subject (`COMP 2210 or 2213`). An OR of
 * anything but single courses (e.g. `(A and B) or C`) is rejected as `null` so
 * the clause falls back rather than being mis-structured.
 */
class ClauseParser {
  private pos = 0;
  private lastSubject: string | null = null;

  constructor(private readonly tokens: Token[]) {}

  atEnd(): boolean {
    return this.pos >= this.tokens.length;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  parseExpr(): PrereqGroup[] | null {
    let groups = this.parseTerm();
    if (groups === null) return null;
    while (this.peek()?.type === "and") {
      this.pos++;
      const next = this.parseTerm();
      if (next === null) return null;
      groups = groups.concat(next);
    }
    return groups;
  }

  private parseTerm(): PrereqGroup[] | null {
    const first = this.parseFactor();
    if (first === null) return null;
    if (this.peek()?.type !== "or") return first;

    // A disjunction collapses to a single OR-group; every alternative must be a
    // single course (a parenthesized multi-group OR is not representable here).
    const alternatives = single(first);
    if (alternatives === null) return null;
    while (this.peek()?.type === "or") {
      this.pos++;
      const next = this.parseFactor();
      if (next === null) return null;
      const refs = single(next);
      if (refs === null) return null;
      alternatives.push(...refs);
    }
    return [{ alternatives }];
  }

  private parseFactor(): PrereqGroup[] | null {
    const token = this.peek();
    if (!token) return null;

    if (token.type === "lparen") {
      this.pos++;
      const inner = this.parseExpr();
      if (inner === null) return null;
      if (this.peek()?.type !== "rparen") return null;
      this.pos++;
      return inner;
    }

    if (token.type === "course") {
      this.pos++;
      this.lastSubject = token.subject;
      return [{ alternatives: [{ subject: token.subject, number: token.number, grade: null }] }];
    }

    if (token.type === "number") {
      if (this.lastSubject === null) return null; // no subject to inherit
      this.pos++;
      return [{ alternatives: [{ subject: this.lastSubject, number: token.number, grade: null }] }];
    }

    return null;
  }
}

/** A single OR-group's alternatives, or `null` if it isn't exactly one group. */
function single(groups: PrereqGroup[]): PrereqCourseRef[] | null {
  if (groups.length !== 1) return null;
  return groups[0].alternatives;
}

// ---------------------------------------------------------------------------
// Grade-restatement merge
// ---------------------------------------------------------------------------

/**
 * The bulletin routinely restates grade thresholds in a second sentence — e.g.
 * "Pr. COMP 1210 or COMP 1213. Pr. COMP 1210 with a grade of C or higher." Left
 * alone, that renders as a confusing duplicate requirement. This folds such a
 * restatement — a fully structured clause of single courses, all already named
 * earlier, that only adds a grade — into the earlier clause's matching refs and
 * drops it. A clause that introduces a *new* course is never dropped (that would
 * lose information); it stays as its own requirement.
 */
function mergeGradeRestatements(
  requirements: PrereqRequirement[],
): PrereqRequirement[] {
  const kept: PrereqRequirement[] = [];

  for (const req of requirements) {
    if (isGradeRestatement(req, kept)) {
      applyGrades(req, kept);
      continue;
    }
    kept.push(req);
  }
  return kept;
}

/** A structured clause of single graded courses, each already named earlier in a
 * clause of the same relation — i.e. it adds only grades, no new courses. */
function isGradeRestatement(
  req: PrereqRequirement,
  earlier: PrereqRequirement[],
): boolean {
  if (req.groups.length === 0) return false;
  const refs: PrereqCourseRef[] = [];
  for (const group of req.groups) {
    if (group.alternatives.length !== 1) return false; // a real OR isn't a restatement
    refs.push(group.alternatives[0]);
  }
  if (!refs.some((r) => r.grade)) return false;
  return refs.every((r) => findRef(earlier, req.relation, r) !== null);
}

/** Copy each restated grade onto the matching earlier ref (never overwriting). */
function applyGrades(req: PrereqRequirement, earlier: PrereqRequirement[]): void {
  for (const group of req.groups) {
    const ref = group.alternatives[0];
    if (!ref.grade) continue;
    const target = findRef(earlier, req.relation, ref);
    if (target && !target.grade) target.grade = ref.grade;
  }
}

/** Find a ref with the same code in an earlier requirement of the same relation. */
function findRef(
  requirements: PrereqRequirement[],
  relation: PrereqRelation,
  ref: PrereqCourseRef,
): PrereqCourseRef | null {
  const key = prereqCodeKey(ref);
  for (const req of requirements) {
    if (req.relation !== relation) continue;
    for (const group of req.groups) {
      for (const candidate of group.alternatives) {
        if (prereqCodeKey(candidate) === key) return candidate;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Fallback edge extraction
// ---------------------------------------------------------------------------

// Course tokens in free prose, for edge extraction from an unstructured clause.
const SCAN_COURSE_RE = /\b([A-Za-z]{2,4})\s+(\d{3,4}[A-Za-z]?)\b/g;

/** Lift every `SUBJECT NUMBER` token out of prose (subject-inheriting continuations
 * are not attempted here — a fallback clause is rare and its explicit codes are
 * enough to keep the inverse graph complete). */
function scanCourseRefs(text: string): PrereqCourseRef[] {
  const refs: PrereqCourseRef[] = [];
  for (const match of text.matchAll(SCAN_COURSE_RE)) {
    refs.push({
      subject: match[1].toUpperCase(),
      number: match[2].toUpperCase(),
      grade: null,
    });
  }
  return refs;
}

/** Distinct refs by catalog code, first occurrence wins (order preserved). */
function dedupeByCode(refs: PrereqCourseRef[]): PrereqCourseRef[] {
  const seen = new Set<string>();
  const out: PrereqCourseRef[] = [];
  for (const ref of refs) {
    const key = prereqCodeKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}
