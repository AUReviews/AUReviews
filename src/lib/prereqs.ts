/**
 * Prerequisite/Unlocks presentation logic (v1-spec §6/§13; issue #22) — pure,
 * framework- and DB-free, so chip resolution and the inverse graph are unit-
 * testable in isolation (the same split as `browse.ts` / `course-detail.ts`).
 *
 * The domain parser (`@/domain` → `prereq.ts`) turns prose into structured edges;
 * this layer resolves those edges against the catalog into render-ready chips and
 * derives the two directions a course page shows:
 *  - **Prerequisites** — the target's own parsed requirements, each referenced
 *    course linked when it exists in our catalog (a cross-department token like
 *    `ELEC 2220` that we don't carry stays an unlinked chip, never dropped).
 *  - **Unlocks** — the TRUE INVERSE of Prerequisites: every course whose
 *    prerequisite edges include the target. It is derived here from the same
 *    {@link prerequisiteEdges} definition over the whole catalog, never stored
 *    or hand-maintained (§6, issue #22 acceptance criteria).
 *
 * Deriving (not storing) the graph keeps the import contract untouched and makes
 * the inverse impossible to desync — the cost is one in-memory pass over the
 * catalog per render, negligible at v1's COMP-only volume and cached behind the
 * course page's ISR/`catalog` tag anyway.
 */

import {
  type PrereqRelation,
  parsePrereqs,
  prereqCodeKey,
  prerequisiteEdges,
} from "@/domain";
import { compareCatalogOrder } from "./browse";
import { courseHref, formatCourseCode } from "./course-detail";

/** The catalog rows the graph is built over: every course's code, title, and
 * verbatim prereq prose. Supplied by the db layer (`listPrereqRows`). Retired
 * courses are included, not filtered — like the browse index (§5, `listCourses`),
 * a retired course keeps its page, so it stays a valid Unlocks target. */
export interface PrereqCatalogRow {
  subject: string;
  number: string;
  title: string;
  prereqText: string | null;
}

/** One prerequisite course as a chip. `href` is null when the referenced course
 * isn't in our catalog (e.g. a cross-department prereq) — shown, but not a link. */
export interface PrereqChipView {
  code: string;
  href: string | null;
  grade: string | null;
}

/** A disjunction rendered as chips — "one of" when it has more than one. */
export interface PrereqGroupView {
  chips: PrereqChipView[];
}

export interface RequirementView {
  relation: PrereqRelation;
  groups: PrereqGroupView[];
  /** Verbatim prose for a clause that couldn't be structured (never dropped). */
  fallback: string | null;
}

/** A course this one unlocks — always in our catalog, so always linked. */
export interface UnlockChipView {
  code: string;
  title: string;
  href: string;
}

export interface CoursePrereqView {
  requirements: RequirementView[];
  unlocks: UnlockChipView[];
  /** The whole verbatim `prereqText` when NOT a single clause could be parsed
   * (there was prose but no `Pr.`/`Coreq.` structure) — the last-resort fallback
   * so information is never lost. Null whenever `requirements` carries the text. */
  rawFallback: string | null;
}

/** Build the full Prerequisites + Unlocks view for one course. */
export function buildCoursePrereqView(
  target: { subject: string; number: string; prereqText: string | null },
  catalog: readonly PrereqCatalogRow[],
): CoursePrereqView {
  const byCode = new Map(catalog.map((c) => [prereqCodeKey(c), c]));

  const parsed = parsePrereqs(target.prereqText);
  const requirements: RequirementView[] = parsed.requirements.map((req) => ({
    relation: req.relation,
    groups: req.groups.map((group) => ({
      chips: group.alternatives.map((ref) => {
        const known = byCode.has(prereqCodeKey(ref));
        return {
          code: formatCourseCode(ref.subject, ref.number),
          href: known ? courseHref(ref.subject, ref.number) : null,
          grade: ref.grade,
        };
      }),
    })),
    fallback: req.fallback,
  }));

  // Whole-text verbatim fallback: prose was present but nothing parsed into a
  // clause at all. When some clause parsed, its per-requirement fallback carries
  // any unstructured text instead, so this stays null to avoid double display.
  const rawFallback =
    parsed.requirements.length === 0 && target.prereqText?.trim()
      ? target.prereqText.trim()
      : null;

  const unlocks = buildUnlocks(target, catalog);

  return { requirements, unlocks, rawFallback };
}

/**
 * The inverse edge set for `target`: every catalog course whose prerequisite
 * edges include it. Derived from the same {@link prerequisiteEdges} used to render
 * the forward direction, so Unlocks can never disagree with Prerequisites. Sorted
 * in catalog order (subject, then COMP number numerically) — the neutral,
 * non-ranking order the rest of the site uses (§5).
 */
function buildUnlocks(
  target: { subject: string; number: string },
  catalog: readonly PrereqCatalogRow[],
): UnlockChipView[] {
  const targetKey = prereqCodeKey(target);

  const unlocked = catalog.filter((course) => {
    if (prereqCodeKey(course) === targetKey) return false; // never itself
    return prerequisiteEdges(course.prereqText).some(
      (edge) => prereqCodeKey(edge) === targetKey,
    );
  });

  unlocked.sort(compareCatalogOrder);

  return unlocked.map((course) => ({
    code: formatCourseCode(course.subject, course.number),
    title: course.title,
    href: courseHref(course.subject, course.number),
  }));
}
