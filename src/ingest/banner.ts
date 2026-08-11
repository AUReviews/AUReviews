/**
 * Banner 8 schedule parser (v1-spec §9; issue #23).
 *
 * Turns two public, no-login Banner pages at `ssbprod.auburn.edu` into flat
 * rows — verified against live fetches of the term dropdown and the COMP
 * listings for Spring 2025 and Fall 2007 (the markup is identical across the
 * full history):
 *
 * - `bwckschd.p_disp_dyn_sched` — the term dropdown; source of the `YYYYT0`
 *   term codes (validated live before hardcoding, per §9).
 * - `bwckschd.p_get_crse_unsec` — one term's full COMP section listing. Each
 *   section is a `ddtitle` header (`Title - CRN - COMP 1210 - 001`) followed
 *   by a "Scheduled Meeting Times" table whose 7th column carries the
 *   instructors: comma-separated names, optionally marked `(P)` for primary,
 *   each usually followed by a `mailto:` link whose NetID is the stable
 *   Banner person key.
 *
 * Only what the Offering model needs is read (§3): course code + instructor
 * set. CRNs, seats, and meeting times are deliberately dropped — Section is
 * not modeled. Pure and dependency-free, like the bulletin parser.
 */

import {
  type IncomingInstructor,
  type IncomingSection,
  instructorDedupeKey,
} from "@/domain";
import { toText } from "./html";

/** A term as offered by the Banner dropdown. */
export interface TermOption {
  code: string;
  label: string;
}

const TERM_OPTION_RE = /<OPTION VALUE="(\d{6})">([^<]*)<\/OPTION>/gi;

// One section header: the `ddtitle` link text holds `Title - CRN - CODE - SEQ`.
const SECTION_TITLE_RE =
  /<th[^>]*CLASS="ddtitle"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/gi;

// `COMP 1210` — subject + number. Banner numbers may carry letters anywhere
// (`1AA0` is a live Fall 2007 example), so require only digit-led alphanumeric;
// unknown codes are the crosswalk planner's problem to report, not ours to drop.
const COURSE_CODE_RE = /^([A-Z]{2,4})\s+(\d[0-9A-Z]{2,4})$/;

// A section's "Scheduled Meeting Times" table (no nested tables inside).
const MEETING_TABLE_RE =
  /<table[^>]*SUMMARY="This table lists the scheduled meeting times[\s\S]*?<\/table>/gi;

const MEETING_ROW_RE = /<tr>[\s\S]*?<\/tr>/gi;
const MEETING_CELL_RE = /<td[^>]*CLASS="dddefault"[^>]*>([\s\S]*?)<\/td>/gi;
/** Instructor column position in the meeting-times table (7 columns). */
const INSTRUCTOR_CELL_INDEX = 6;

const MAILTO_RE = /mailto:([^"@]+)@/i;

/** Parse the term dropdown into its options, skipping the empty "None". */
export function parseTermOptions(html: string): TermOption[] {
  const options: TermOption[] = [];
  for (const match of html.matchAll(TERM_OPTION_RE)) {
    const label = toText(match[2]).replace(/\s*\(View only\)$/i, "");
    options.push({ code: match[1], label });
  }
  return options;
}

/** Parse one term's schedule listing into section rows, skipping any section
 * whose header we can't read. */
export function parseBannerSchedule(html: string): IncomingSection[] {
  const sections: IncomingSection[] = [];

  // Section headers in document order; each section's body runs to the next.
  const headers = [...html.matchAll(SECTION_TITLE_RE)];
  for (const [i, header] of headers.entries()) {
    const titleText = toText(header[1]);

    // Parse `Title - CRN - CODE - SEQ` from the right: the title itself may
    // contain ` - `, the fixed suffix fields never do.
    const parts = titleText.split(" - ");
    if (parts.length < 4) continue;
    const codeMatch = COURSE_CODE_RE.exec(parts[parts.length - 2]);
    if (!codeMatch) continue;
    const [, subject, number] = codeMatch;

    const bodyStart = header.index + header[0].length;
    const bodyEnd =
      i + 1 < headers.length ? headers[i + 1].index : html.length;
    const body = html.slice(bodyStart, bodyEnd);

    sections.push({
      subject,
      number,
      instructors: parseSectionInstructors(body),
    });
  }

  return sections;
}

/** Union the instructors across a section's meeting rows, deduped by NetID
 * where present, else by display name. */
function parseSectionInstructors(sectionBody: string): IncomingInstructor[] {
  const instructors: IncomingInstructor[] = [];
  const seen = new Set<string>();

  for (const table of sectionBody.matchAll(MEETING_TABLE_RE)) {
    for (const row of table[0].matchAll(MEETING_ROW_RE)) {
      const cells = [...row[0].matchAll(MEETING_CELL_RE)];
      if (cells.length <= INSTRUCTOR_CELL_INDEX) continue; // header/short row
      for (const instructor of parseInstructorCell(
        cells[INSTRUCTOR_CELL_INDEX][1],
      )) {
        const key = instructorDedupeKey(instructor);
        if (seen.has(key)) continue;
        seen.add(key);
        instructors.push(instructor);
      }
    }
  }

  return instructors;
}

/**
 * Parse one instructor cell: entries separated by commas that sit outside
 * markup (names themselves are comma-free `First Last` strings; commas never
 * appear inside the cell's tags). Each entry is a name, an optional `(P)`
 * primary marker, and an optional `mailto:` link carrying the NetID.
 */
function parseInstructorCell(cell: string): IncomingInstructor[] {
  const instructors: IncomingInstructor[] = [];

  for (const entry of splitTopLevelCommas(cell)) {
    const netId = MAILTO_RE.exec(entry)?.[1] ?? null;
    // The visible text minus the `(P)` marker is the display name.
    const displayName = toText(entry.replace(/\(\s*<ABBR[\s\S]*?<\/ABBR>\s*\)/gi, ""))
      .replace(/\s*\(P\)\s*$/, "")
      .trim();
    if (!displayName || displayName.toUpperCase() === "TBA") continue;
    instructors.push({ displayName, bannerKey: netId });
  }

  return instructors;
}

/** Split on commas that are not inside an HTML tag. */
function splitTopLevelCommas(fragment: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inTag = false;
  for (const char of fragment) {
    if (char === "<") inTag = true;
    else if (char === ">") inTag = false;
    if (char === "," && !inTag) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts;
}
