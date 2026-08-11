import { describe, expect, it } from "vitest";
import type {
  CourseId,
  ExistingInstructor,
  ExistingOffering,
  InstructorId,
  OfferingsPlan,
  OfferingsSnapshot,
  PendingInstructorAction,
} from "@/domain";
import {
  type OfferingsIngestDeps,
  runOfferingsIngest,
} from "./import-offerings";

/** Build a Banner term-dropdown page from `(code, label)` pairs. */
function termDropdown(options: Array<[string, string]>): string {
  const opts = options
    .map(([code, label]) => `<OPTION VALUE="${code}">${label}</OPTION>`)
    .join("\n");
  return `<select name="p_term">\n<OPTION VALUE="">None</OPTION>\n${opts}\n</select>`;
}

interface FakeSection {
  code: string; // "COMP 1210"
  instructors: Array<{ name: string; netId: string | null }>;
}

/** Build a Banner schedule page in the live markup shape the parser expects. */
function schedulePage(termCode: string, sections: FakeSection[]): string {
  const blocks = sections
    .map((s, i) => {
      const cell = s.instructors.length
        ? s.instructors
            .map(
              (p, j) =>
                `${p.name}${j === 0 ? ' (<ABBR title= "Primary">P</ABBR>)' : ""}${
                  p.netId
                    ? `<a href="mailto:${p.netId}@auburn.edu" target="${p.name}"><img src="/wtlgifs/web_email.gif" alt="E-mail" /></a>`
                    : ""
                }`,
            )
            .join(", ")
        : "TBA";
      return `<tr>
<th CLASS="ddtitle" scope="colgroup" ><a href="/pls/PROD/bwckschd.p_disp_detail_sched?term_in=${termCode}&amp;crn_in=1000${i}">Some Course - 1000${i} - ${s.code} - 001</a></th>
</tr>
<tr>
<TD CLASS="dddefault">
<table CLASS="datadisplaytable" SUMMARY="This table lists the scheduled meeting times and assigned instructors for this class.."><caption>Scheduled Meeting Times</caption>
<tr><th CLASS="ddheader">Type</th><th CLASS="ddheader">Time</th><th CLASS="ddheader">Days</th><th CLASS="ddheader">Where</th><th CLASS="ddheader">Date Range</th><th CLASS="ddheader">Schedule Type</th><th CLASS="ddheader">Instructors</th></tr>
<tr><td CLASS="dddefault">Class</td><td CLASS="dddefault">TBA</td><td CLASS="dddefault">&nbsp;</td><td CLASS="dddefault">TBA</td><td CLASS="dddefault">Jan 13 - May 09</td><td CLASS="dddefault">Lecture</td><td CLASS="dddefault">${cell}</td></tr>
</table>
</TD>
</tr>`;
    })
    .join("\n");
  return `<table CLASS="datadisplaytable" SUMMARY="This layout table is used to present the sections found">\n${blocks}\n</table>`;
}

/**
 * In-memory stand-in for the db offerings layer, applying plans with the same
 * semantics as `src/db/offerings.ts`: idempotent creates, link add/remove,
 * pending dedupe by nameKey — and no way to delete an instructor at all.
 */
class FakeOfferingsStore {
  instructors = new Map<InstructorId, ExistingInstructor>();
  offerings = new Map<string, ExistingOffering>();
  pendings: PendingInstructorAction[] = [];

  constructor(private crosswalk: Array<{ catalogKey: string; courseId: CourseId }>) {}

  snapshot(): OfferingsSnapshot {
    return {
      crosswalk: this.crosswalk,
      instructors: [...this.instructors.values()],
      offerings: [...this.offerings.values()].map((o) => ({
        ...o,
        instructorIds: [...o.instructorIds],
      })),
      pendingNameKeys: this.pendings.map((p) => p.nameKey),
    };
  }

  apply(plan: OfferingsPlan): void {
    for (const create of plan.instructorCreates) {
      if (!this.instructors.has(create.id)) {
        this.instructors.set(create.id, { ...create });
      }
    }
    for (const rename of plan.instructorRenames) {
      const existing = this.instructors.get(rename.id);
      if (existing) existing.displayName = rename.displayName;
    }
    for (const pending of plan.instructorPendings) {
      if (!this.pendings.some((p) => p.nameKey === pending.nameKey)) {
        this.pendings.push(pending);
      }
    }
    for (const create of plan.offeringCreates) {
      const key = `${create.courseId} ${create.termCode}`;
      if (!this.offerings.has(key)) {
        this.offerings.set(key, { ...create, instructorIds: [] });
      }
    }
    for (const link of plan.linkAdds) {
      const offering = this.offerings.get(`${link.courseId} ${link.termCode}`);
      if (offering && !offering.instructorIds.includes(link.instructorId)) {
        offering.instructorIds.push(link.instructorId);
      }
    }
    for (const removal of plan.linkRemovals) {
      const offering = this.offerings.get(
        `${removal.courseId} ${removal.termCode}`,
      );
      if (offering) {
        offering.instructorIds = offering.instructorIds.filter(
          (id) => id !== removal.instructorId,
        );
      }
    }
  }
}

const COURSE_1210 = "course-1210" as CourseId;
const COURSE_3270 = "course-3270" as CourseId;

function makeDeps(
  store: FakeOfferingsStore,
  pages: Record<string, string>,
  fetched: string[] = [],
): OfferingsIngestDeps {
  return {
    fetchTermListHtml: async () =>
      termDropdown([
        ["202520", "Spring 2025 (View only)"],
        ["200810", "Fall 2007 (View only)"],
        ["200730", "Summer 2007 (View only)"], // pre-floor: must be skipped
      ]),
    fetchTermScheduleHtml: async (termCode) => {
      fetched.push(termCode);
      return pages[termCode] ?? schedulePage(termCode, []);
    },
    loadSnapshot: async () => store.snapshot(),
    applyPlan: async (plan) => store.apply(plan),
  };
}

const PAGES: Record<string, string> = {
  "200810": schedulePage("200810", [
    {
      code: "COMP 1210",
      instructors: [{ name: "Daniela   Marghitu", netId: "marghda" }],
    },
  ]),
  "202520": schedulePage("202520", [
    {
      code: "COMP 1210",
      instructors: [
        { name: "Daniela Marghitu", netId: "marghda" },
        { name: "Aparana Pant", netId: "azp0200" },
      ],
    },
    { code: "COMP 3270", instructors: [] },
    { code: "COMP 9999", instructors: [] }, // not in the crosswalk
  ]),
};

function makeStore(): FakeOfferingsStore {
  return new FakeOfferingsStore([
    { catalogKey: "COMP 1210", courseId: COURSE_1210 },
    { catalogKey: "COMP 3270", courseId: COURSE_3270 },
  ]);
}

describe("runOfferingsIngest", () => {
  it("imports offerings back to Fall 2007, minting one identity per person", async () => {
    const store = makeStore();
    const fetched: string[] = [];
    const summary = await runOfferingsIngest(makeDeps(store, PAGES, fetched));

    // Chronological, and the pre-Fall-2007 term was never fetched.
    expect(fetched).toEqual(["200810", "202520"]);
    expect(summary.terms).toBe(2);
    expect(summary.offeringsSeen).toBe(4);
    expect(summary.offeringsCreated).toBe(3); // 9999 skipped
    expect(summary.instructorsCreated).toBe(2); // Marghitu minted once
    expect(summary.linksAdded).toBe(3);
    expect(summary.unmatchedCatalogKeys).toEqual(["COMP 9999"]);

    expect(store.instructors.size).toBe(2);
    const offering200810 = store.offerings.get(`${COURSE_1210} 200810`)!;
    const offering202520 = store.offerings.get(`${COURSE_1210} 202520`)!;
    expect(offering200810.instructorIds).toEqual(
      offering202520.instructorIds.slice(0, 1),
    );
  });

  it("is idempotent across re-runs", async () => {
    const store = makeStore();
    await runOfferingsIngest(makeDeps(store, PAGES));
    const before = JSON.stringify(store.snapshot());

    const summary = await runOfferingsIngest(makeDeps(store, PAGES));

    expect(summary.offeringsCreated).toBe(0);
    expect(summary.instructorsCreated).toBe(0);
    expect(summary.instructorsRenamed).toBe(0);
    expect(summary.pending).toBe(0);
    expect(summary.linksAdded).toBe(0);
    expect(summary.linksRemoved).toBe(0);
    expect(JSON.stringify(store.snapshot())).toBe(before);
  });

  it("updates instructor sets on re-import without ever deleting an instructor", async () => {
    const store = makeStore();
    await runOfferingsIngest(makeDeps(store, PAGES));

    // Spring 2025 correction: Pant no longer listed on COMP 1210.
    const corrected: Record<string, string> = {
      ...PAGES,
      "202520": schedulePage("202520", [
        {
          code: "COMP 1210",
          instructors: [{ name: "Daniela Marghitu", netId: "marghda" }],
        },
        { code: "COMP 3270", instructors: [] },
      ]),
    };
    const summary = await runOfferingsIngest(makeDeps(store, corrected));

    expect(summary.linksRemoved).toBe(1);
    const offering = store.offerings.get(`${COURSE_1210} 202520`)!;
    expect(offering.instructorIds).toHaveLength(1);
    // The unlinked instructor's durable identity survives (ADR 0002).
    expect(store.instructors.size).toBe(2);
    expect(
      [...store.instructors.values()].some((i) => i.bannerKey === "azp0200"),
    ).toBe(true);
  });
});
