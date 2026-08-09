/**
 * Bulletin catalog parser (v1-spec §9, research/auburn-course-data.md).
 *
 * Turns the public CourseLeaf "Courses of Instruction" HTML at
 * `bulletin.auburn.edu/coursesofinstruction/comp/` into flat catalog rows. The
 * page is server-rendered HTML (not JS-gated) with one `.courseblock` per course:
 * a `.courseblocktitle` (`COMP 2210 FUNDAMENTALS OF COMPUTING II (4)`) and a
 * `.courseblockdesc` body that mixes `LEC./LAB.` credit breakdowns, `Pr./Coreq.`
 * prerequisite prose, and the description.
 *
 * Pure and dependency-free: a targeted parser over the class-tagged paragraphs,
 * not a full DOM. The whole course body is kept as the description losslessly, so
 * the fully verbatim prose (prereqs included) is always retained. `prereqText` is
 * a convenience field lifting each `Pr.`/`Coreq.` clause out verbatim per-clause
 * (joined by a space when a course has several) — structured `Pr.` parsing is a
 * separate ticket (§9).
 *
 * The exact class names match Leepfrog's standard CourseLeaf output; validate
 * against a live fetch if Auburn's template ever diverges.
 */

import type { IncomingCourse } from "@/domain";

/**
 * A raw catalog row as scraped from one bulletin course block. Structurally the
 * domain's {@link IncomingCourse} — aliased, not re-declared, so the parser's
 * output and the crosswalk planner's input can never silently drift apart.
 */
export type RawCatalogRow = IncomingCourse;

const COURSEBLOCK_RE =
  /<div[^>]*class="[^"]*\bcourseblock\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
const TITLE_RE =
  /<p[^>]*class="[^"]*\bcourseblocktitle\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i;
const DESC_RE =
  /<p[^>]*class="[^"]*\bcourseblockdesc\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i;

// `COMP 2210 FUNDAMENTALS OF COMPUTING II (4)` → subject, number, rest.
// The number may carry a trailing letter (e.g. a lab suffix), so allow one.
const TITLE_LINE_RE = /^([A-Z]{2,4})\s+(\d{3,4}[A-Z]?)\s+(.+)$/;

// A prereq/coreq clause runs from the `Pr.`/`Coreq.` marker to the first
// sentence-terminating period. Course tokens and grouping contain no periods, so
// `[^.]*` stops exactly at the clause end and not inside `COMP 2210`.
const PREREQ_CLAUSE_RE = /(?:Pr\.|Coreq\.)[^.]*\./g;

/** Parse the whole COMP page into rows, skipping any block we can't read. */
export function parseCatalogHtml(html: string): RawCatalogRow[] {
  const rows: RawCatalogRow[] = [];

  for (const block of html.matchAll(COURSEBLOCK_RE)) {
    const inner = block[1];

    const titleMatch = inner.match(TITLE_RE);
    if (!titleMatch) continue;
    const titleLine = toText(titleMatch[1]);

    const parsedLine = TITLE_LINE_RE.exec(titleLine);
    if (!parsedLine) continue;
    const [, subject, number, rest] = parsedLine;
    const { title, creditHours } = parseCreditHours(rest);

    const descMatch = inner.match(DESC_RE);
    const description = descMatch ? toText(descMatch[1]) || null : null;

    rows.push({
      subject,
      number,
      title,
      creditHours,
      description,
      prereqText: extractPrereqText(description),
    });
  }

  return rows;
}

/**
 * Split a `TITLE (n)` string into its title and verbatim credit-hours token.
 * Accepts a single value `(4)` or a range `(1-3)` (variable-credit courses), and
 * leaves the parenthetical on the title if it isn't credit-shaped so nothing odd
 * is silently swallowed.
 */
export function parseCreditHours(rest: string): {
  title: string;
  creditHours: string | null;
} {
  const match = rest.match(/^(.*?)\s*\((\d+(?:\s*[-–]\s*\d+)?)\)\s*$/);
  if (!match) return { title: rest.trim(), creditHours: null };
  return { title: match[1].trim(), creditHours: match[2].replace(/\s+/g, "") };
}

/** Lift every `Pr.`/`Coreq.` clause out of a body verbatim, joined by a space. */
function extractPrereqText(description: string | null): string | null {
  if (!description) return null;
  const clauses = description.match(PREREQ_CLAUSE_RE);
  if (!clauses || clauses.length === 0) return null;
  return clauses.map((c) => c.trim()).join(" ");
}

/** Strip inline tags, decode the entities the bulletin uses, and collapse space. */
function toText(fragment: string): string {
  return decodeEntities(fragment.replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&rsquo;/g, "’")
    .replace(/&lsquo;/g, "‘")
    .replace(/&rdquo;/g, "”")
    .replace(/&ldquo;/g, "“")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(parseInt(code, 16)),
    );
}
