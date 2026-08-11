import { describe, expect, it } from "vitest";
import type { CourseId } from "./identity";
import { type InstructorId, normalizeInstructorName } from "./identity";
import {
  type IncomingOffering,
  type IncomingSection,
  type OfferingsSnapshot,
  collapseSections,
  planOfferings,
} from "./offerings";

const COURSE_A = "course-a" as CourseId;
const COURSE_B = "course-b" as CourseId;

/** Deterministic instructor-id minter for stable assertions. */
function makeMinter(): () => InstructorId {
  let n = 0;
  return () => `instructor-${++n}` as InstructorId;
}

function emptySnapshot(): OfferingsSnapshot {
  return {
    crosswalk: [
      { catalogKey: "COMP 1210", courseId: COURSE_A },
      { catalogKey: "COMP 3270", courseId: COURSE_B },
    ],
    instructors: [],
    offerings: [],
    pendingNameKeys: [],
  };
}

function offering(
  catalogKey: string,
  termCode: string,
  instructors: IncomingOffering["instructors"],
): IncomingOffering {
  return { catalogKey, termCode, instructors };
}

describe("collapseSections", () => {
  it("collapses section rows into (course, term) offerings with a deduped instructor set", () => {
    const sections: IncomingSection[] = [
      {
        subject: "COMP",
        number: "1210",
        instructors: [{ displayName: "Vishalini Laguduva  Ramnath", bannerKey: "vlr0013" }],
      },
      {
        subject: "COMP",
        number: "1210",
        instructors: [
          // Same person again from another section/meeting row.
          { displayName: "Vishalini Laguduva Ramnath", bannerKey: "vlr0013" },
          { displayName: "Aparana Pant", bannerKey: "azp0200" },
        ],
      },
      { subject: "COMP", number: "3270", instructors: [] },
    ];

    const rows = collapseSections("202520", sections);
    expect(rows).toHaveLength(2);

    const comp1210 = rows.find((r) => r.catalogKey === "COMP 1210")!;
    expect(comp1210.termCode).toBe("202520");
    expect(comp1210.instructors.map((i) => i.bannerKey)).toEqual([
      "vlr0013",
      "azp0200",
    ]);

    const comp3270 = rows.find((r) => r.catalogKey === "COMP 3270")!;
    expect(comp3270.instructors).toEqual([]);
  });

  it("dedupes keyless instructors by normalized name", () => {
    const sections: IncomingSection[] = [
      {
        subject: "COMP",
        number: "1210",
        instructors: [
          { displayName: "Pat  Doe", bannerKey: null },
          { displayName: "Pat Doe", bannerKey: null },
        ],
      },
    ];
    const rows = collapseSections("202520", sections);
    expect(rows[0].instructors).toHaveLength(1);
  });
});

describe("planOfferings — first import", () => {
  it("mints instructors once per person, creates offerings, links instructors", () => {
    const rows = [
      offering("COMP 1210", "202520", [
        { displayName: "Vishalini Laguduva Ramnath", bannerKey: "vlr0013" },
      ]),
      offering("COMP 3270", "202520", [
        // Same person teaches a second course — one durable identity.
        { displayName: "Vishalini Laguduva Ramnath", bannerKey: "vlr0013" },
        { displayName: "James Cross", bannerKey: null },
      ]),
    ];

    const plan = planOfferings(rows, emptySnapshot(), { mintId: makeMinter() });

    expect(plan.instructorCreates).toHaveLength(2);
    const [vlr, cross] = plan.instructorCreates;
    expect(vlr).toMatchObject({
      id: "instructor-1",
      displayName: "Vishalini Laguduva Ramnath",
      bannerKey: "vlr0013",
      nameKey: normalizeInstructorName("Vishalini Laguduva Ramnath"),
    });
    expect(cross).toMatchObject({ bannerKey: null });

    expect(plan.offeringCreates).toEqual([
      { courseId: COURSE_A, termCode: "202520" },
      { courseId: COURSE_B, termCode: "202520" },
    ]);
    expect(plan.linkAdds).toEqual([
      { courseId: COURSE_A, termCode: "202520", instructorId: "instructor-1" },
      { courseId: COURSE_B, termCode: "202520", instructorId: "instructor-1" },
      { courseId: COURSE_B, termCode: "202520", instructorId: "instructor-2" },
    ]);
    expect(plan.linkRemovals).toEqual([]);
    expect(plan.instructorPendings).toEqual([]);
    expect(plan.unmatchedCatalogKeys).toEqual([]);
  });

  it("reports Banner courses missing from the crosswalk instead of guessing", () => {
    const rows = [offering("COMP 9999", "200810", [])];
    const plan = planOfferings(rows, emptySnapshot(), { mintId: makeMinter() });
    expect(plan.unmatchedCatalogKeys).toEqual(["COMP 9999"]);
    expect(plan.offeringCreates).toEqual([]);
  });
});

describe("planOfferings — idempotency", () => {
  it("plans nothing when the snapshot already reflects the import", () => {
    const snapshot: OfferingsSnapshot = {
      ...emptySnapshot(),
      instructors: [
        {
          id: "instructor-1" as InstructorId,
          displayName: "Vishalini Laguduva Ramnath",
          bannerKey: "vlr0013",
          nameKey: normalizeInstructorName("Vishalini Laguduva Ramnath"),
        },
      ],
      offerings: [
        {
          courseId: COURSE_A,
          termCode: "202520",
          instructorIds: ["instructor-1" as InstructorId],
        },
      ],
    };
    const rows = [
      offering("COMP 1210", "202520", [
        { displayName: "Vishalini Laguduva Ramnath", bannerKey: "vlr0013" },
      ]),
    ];

    const plan = planOfferings(rows, snapshot, { mintId: makeMinter() });

    expect(plan.instructorCreates).toEqual([]);
    expect(plan.instructorRenames).toEqual([]);
    expect(plan.instructorPendings).toEqual([]);
    expect(plan.offeringCreates).toEqual([]);
    expect(plan.linkAdds).toEqual([]);
    expect(plan.linkRemovals).toEqual([]);
  });
});

describe("planOfferings — instructor identity resolution", () => {
  const existingVlr = {
    id: "instructor-1" as InstructorId,
    displayName: "Vishalini Laguduva Ramnath",
    bannerKey: "vlr0013",
    nameKey: normalizeInstructorName("Vishalini Laguduva Ramnath"),
  };

  it("matches on Banner key and treats display name as mutable (rename, same id)", () => {
    const snapshot = { ...emptySnapshot(), instructors: [existingVlr] };
    const rows = [
      offering("COMP 1210", "202520", [
        { displayName: "Vishalini L. Ramnath", bannerKey: "vlr0013" },
      ]),
    ];

    const plan = planOfferings(rows, snapshot, { mintId: makeMinter() });

    expect(plan.instructorCreates).toEqual([]);
    expect(plan.instructorRenames).toEqual([
      { id: "instructor-1", displayName: "Vishalini L. Ramnath" },
    ]);
    expect(plan.linkAdds).toEqual([
      { courseId: COURSE_A, termCode: "202520", instructorId: "instructor-1" },
    ]);
  });

  it("resolves a keyless instructor to the single existing name match", () => {
    const existing = {
      id: "instructor-1" as InstructorId,
      displayName: "James Cross",
      bannerKey: null,
      nameKey: normalizeInstructorName("James Cross"),
    };
    const snapshot = { ...emptySnapshot(), instructors: [existing] };
    const rows = [
      offering("COMP 1210", "200810", [
        { displayName: "James  Cross", bannerKey: null },
      ]),
    ];

    const plan = planOfferings(rows, snapshot, { mintId: makeMinter() });

    expect(plan.instructorCreates).toEqual([]);
    expect(plan.linkAdds).toEqual([
      { courseId: COURSE_A, termCode: "200810", instructorId: "instructor-1" },
    ]);
  });

  it("flags a new Banner key colliding with an existing name as pending — never auto-merged", () => {
    const existingKeyless = { ...existingVlr, bannerKey: null };
    const snapshot = { ...emptySnapshot(), instructors: [existingKeyless] };
    const rows = [
      offering("COMP 1210", "202520", [
        { displayName: "Vishalini Laguduva Ramnath", bannerKey: "vlr0013" },
      ]),
    ];

    const plan = planOfferings(rows, snapshot, { mintId: makeMinter() });

    expect(plan.instructorCreates).toEqual([]);
    expect(plan.instructorPendings).toEqual([
      {
        nameKey: existingKeyless.nameKey,
        displayName: "Vishalini Laguduva Ramnath",
        bannerKey: "vlr0013",
        reason: "ambiguous-instructor-match",
        candidateInstructorIds: ["instructor-1"],
        firstSeen: { catalogKey: "COMP 1210", termCode: "202520" },
      },
    ]);
    // The offering still lands; the unresolved instructor is simply not linked.
    expect(plan.offeringCreates).toEqual([
      { courseId: COURSE_A, termCode: "202520" },
    ]);
    expect(plan.linkAdds).toEqual([]);
  });

  it("flags a keyless name matching several existing instructors as pending", () => {
    const twins = [
      { ...existingVlr, id: "instructor-1" as InstructorId, bannerKey: "vlr0013" },
      { ...existingVlr, id: "instructor-2" as InstructorId, bannerKey: "vlr9999" },
    ];
    const snapshot = { ...emptySnapshot(), instructors: twins };
    const rows = [
      offering("COMP 1210", "202520", [
        { displayName: "Vishalini Laguduva Ramnath", bannerKey: null },
      ]),
    ];

    const plan = planOfferings(rows, snapshot, { mintId: makeMinter() });

    expect(plan.instructorCreates).toEqual([]);
    expect(plan.instructorPendings).toHaveLength(1);
    expect(plan.instructorPendings[0].candidateInstructorIds).toEqual([
      "instructor-1",
      "instructor-2",
    ]);
  });

  it("does not re-queue a nameKey already pending, in-snapshot or in-run", () => {
    const existingKeyless = { ...existingVlr, bannerKey: null };
    const snapshot: OfferingsSnapshot = {
      ...emptySnapshot(),
      instructors: [existingKeyless],
      pendingNameKeys: [existingKeyless.nameKey],
    };
    const rows = [
      offering("COMP 1210", "202520", [
        { displayName: "Vishalini Laguduva Ramnath", bannerKey: "vlr0013" },
      ]),
      // Second sighting in the same run must not duplicate either.
      offering("COMP 3270", "202520", [
        { displayName: "Vishalini Laguduva Ramnath", bannerKey: "vlr0013" },
      ]),
    ];

    const plan = planOfferings(rows, snapshot, { mintId: makeMinter() });
    expect(plan.instructorPendings).toEqual([]);
  });
});

describe("planOfferings — instructor-set changes on an existing offering", () => {
  it("adds newly listed instructors and unlinks ones no longer listed, without deleting anyone", () => {
    const kept = {
      id: "existing-kept" as InstructorId,
      displayName: "Kept Person",
      bannerKey: "kp0001",
      nameKey: normalizeInstructorName("Kept Person"),
    };
    const dropped = {
      id: "existing-dropped" as InstructorId,
      displayName: "Dropped Person",
      bannerKey: "dp0001",
      nameKey: normalizeInstructorName("Dropped Person"),
    };
    const snapshot: OfferingsSnapshot = {
      ...emptySnapshot(),
      instructors: [kept, dropped],
      offerings: [
        {
          courseId: COURSE_A,
          termCode: "202710",
          instructorIds: [kept.id, dropped.id],
        },
      ],
    };
    const rows = [
      offering("COMP 1210", "202710", [
        { displayName: "Kept Person", bannerKey: "kp0001" },
        { displayName: "New Person", bannerKey: "np0001" },
      ]),
    ];

    const plan = planOfferings(rows, snapshot, { mintId: makeMinter() });

    expect(plan.offeringCreates).toEqual([]); // offering already exists
    expect(plan.instructorCreates).toHaveLength(1); // only New Person
    expect(plan.linkAdds).toEqual([
      // Kept Person is already linked; only the newly minted instructor joins.
      { courseId: COURSE_A, termCode: "202710", instructorId: "instructor-1" },
    ]);
    // The link is catalog-side and re-derivable — removed. The durable
    // Instructor row itself is never deleted (no such action exists).
    expect(plan.linkRemovals).toEqual([
      { courseId: COURSE_A, termCode: "202710", instructorId: dropped.id },
    ]);
  });

  it("never unlinks offerings absent from this import (partial-term runs stay safe)", () => {
    const someone = {
      id: "instructor-1" as InstructorId,
      displayName: "Some One",
      bannerKey: "so0001",
      nameKey: normalizeInstructorName("Some One"),
    };
    const snapshot: OfferingsSnapshot = {
      ...emptySnapshot(),
      instructors: [someone],
      offerings: [
        { courseId: COURSE_A, termCode: "200810", instructorIds: [someone.id] },
      ],
    };
    // Import covers a different term only.
    const rows = [offering("COMP 1210", "202710", [])];

    const plan = planOfferings(rows, snapshot, { mintId: makeMinter() });
    expect(plan.linkRemovals).toEqual([]);
  });
});
