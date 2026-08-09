import { describe, expect, it } from "vitest";
import type { CourseId } from "./identity";
import {
  type CatalogSnapshot,
  type IncomingCourse,
  planIngest,
} from "./crosswalk";

/** Deterministic id minter so plans are assertable. */
function counterMinter() {
  let n = 0;
  return () => `minted-${++n}` as CourseId;
}

/** A minimal incoming row with sensible defaults. */
function row(over: Partial<IncomingCourse> & Pick<IncomingCourse, "subject" | "number" | "title">): IncomingCourse {
  return {
    description: null,
    creditHours: null,
    prereqText: null,
    ...over,
  };
}

const EMPTY: CatalogSnapshot = { courses: [], crosswalk: [], pendingKeys: [] };
const OPTS = { catalogYear: "2026-2027" };

describe("planIngest", () => {
  it("mints a durable id and creates a course for a genuinely new code", () => {
    const plan = planIngest([row({ subject: "COMP", number: "2210", title: "Data Structures" })], EMPTY, {
      ...OPTS,
      mintId: counterMinter(),
    });

    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0].courseId).toBe("minted-1");
    expect(plan.creates[0].catalogKey).toBe("COMP 2210");
    expect(plan.creates[0].attributes.catalogYear).toBe("2026-2027");
    expect(plan.applies).toHaveLength(0);
    expect(plan.pendings).toHaveLength(0);
    expect(plan.retirements).toHaveLength(0);
  });

  it("applies (updates) an existing course when the crosswalk already maps its key", () => {
    const snapshot: CatalogSnapshot = {
      courses: [
        { id: "c1" as CourseId, catalogKey: "COMP 2210", title: "Old Title", status: "active" },
      ],
      crosswalk: [{ catalogKey: "COMP 2210", courseId: "c1" as CourseId }],
      pendingKeys: [],
    };

    const plan = planIngest(
      [row({ subject: "COMP", number: "2210", title: "New Title", creditHours: "4" })],
      snapshot,
      { ...OPTS, mintId: counterMinter() },
    );

    expect(plan.creates).toHaveLength(0);
    expect(plan.applies).toHaveLength(1);
    expect(plan.applies[0].courseId).toBe("c1");
    expect(plan.applies[0].attributes.title).toBe("New Title");
    expect(plan.applies[0].attributes.creditHours).toBe("4");
    expect(plan.retirements).toHaveLength(0);
  });

  it("repairs an orphaned course (present but missing its crosswalk edge) by applying, not minting", () => {
    // A prior run inserted the course but its crosswalk insert failed — the
    // course carries the current key yet no mapping exists. A re-run must not
    // mint a duplicate; it applies to the existing course and re-maps it.
    const snapshot: CatalogSnapshot = {
      courses: [
        { id: "c1" as CourseId, catalogKey: "COMP 2210", title: "Data Structures", status: "active" },
      ],
      crosswalk: [],
      pendingKeys: [],
    };

    const plan = planIngest(
      [row({ subject: "COMP", number: "2210", title: "Data Structures" })],
      snapshot,
      { ...OPTS, mintId: counterMinter() },
    );

    expect(plan.creates).toHaveLength(0);
    expect(plan.applies).toHaveLength(1);
    expect(plan.applies[0].courseId).toBe("c1");
    expect(plan.applies[0].catalogKey).toBe("COMP 2210");
    expect(plan.retirements).toHaveLength(0);
  });

  it("is idempotent: re-importing the same catalog re-applies and creates nothing new", () => {
    const snapshot: CatalogSnapshot = {
      courses: [
        { id: "c1" as CourseId, catalogKey: "COMP 2210", title: "Data Structures", status: "active" },
      ],
      crosswalk: [{ catalogKey: "COMP 2210", courseId: "c1" as CourseId }],
      pendingKeys: [],
    };

    const plan = planIngest(
      [row({ subject: "COMP", number: "2210", title: "Data Structures" })],
      snapshot,
      { ...OPTS, mintId: counterMinter() },
    );

    expect(plan.creates).toHaveLength(0);
    expect(plan.applies).toHaveLength(1);
    expect(plan.pendings).toHaveLength(0);
    expect(plan.retirements).toHaveLength(0);
  });

  it("retires an active course that is absent from the latest import (never deletes)", () => {
    const snapshot: CatalogSnapshot = {
      courses: [
        { id: "c1" as CourseId, catalogKey: "COMP 2210", title: "Data Structures", status: "active" },
        { id: "c2" as CourseId, catalogKey: "COMP 1000", title: "PC Applications", status: "active" },
      ],
      crosswalk: [
        { catalogKey: "COMP 2210", courseId: "c1" as CourseId },
        { catalogKey: "COMP 1000", courseId: "c2" as CourseId },
      ],
      pendingKeys: [],
    };

    // Import contains only COMP 2210 now — COMP 1000 dropped out.
    const plan = planIngest(
      [row({ subject: "COMP", number: "2210", title: "Data Structures" })],
      snapshot,
      { ...OPTS, mintId: counterMinter() },
    );

    expect(plan.applies.map((a) => a.courseId)).toEqual(["c1"]);
    expect(plan.retirements).toEqual(["c2" as CourseId]);
  });

  it("does not retire a course that reappears — it re-applies (un-retires) instead", () => {
    const snapshot: CatalogSnapshot = {
      courses: [
        { id: "c1" as CourseId, catalogKey: "COMP 2210", title: "Data Structures", status: "retired" },
      ],
      crosswalk: [{ catalogKey: "COMP 2210", courseId: "c1" as CourseId }],
      pendingKeys: [],
    };

    const plan = planIngest(
      [row({ subject: "COMP", number: "2210", title: "Data Structures" })],
      snapshot,
      { ...OPTS, mintId: counterMinter() },
    );

    expect(plan.applies).toHaveLength(1);
    expect(plan.applies[0].courseId).toBe("c1");
    expect(plan.retirements).toHaveLength(0);
  });

  it("flags a possible renumber as pending instead of auto-applying or minting", () => {
    // An existing active course carries this title under a DIFFERENT number.
    const snapshot: CatalogSnapshot = {
      courses: [
        { id: "c1" as CourseId, catalogKey: "COMP 2210", title: "Fundamentals of Computing II", status: "active" },
      ],
      crosswalk: [{ catalogKey: "COMP 2210", courseId: "c1" as CourseId }],
      pendingKeys: [],
    };

    // Incoming: same title, new number COMP 2220. Could be a renumber — never inferred.
    const plan = planIngest(
      [row({ subject: "COMP", number: "2220", title: "Fundamentals of Computing II" })],
      snapshot,
      { ...OPTS, mintId: counterMinter() },
    );

    expect(plan.creates).toHaveLength(0);
    expect(plan.pendings).toHaveLength(1);
    expect(plan.pendings[0].catalogKey).toBe("COMP 2220");
    expect(plan.pendings[0].reason).toBe("possible-renumber");
    expect(plan.pendings[0].candidateCourseIds).toEqual(["c1" as CourseId]);
  });

  it("flags an intra-import cross-list (two new numbers sharing a title) as pending", () => {
    const plan = planIngest(
      [
        row({ subject: "COMP", number: "5000", title: "Machine Learning" }),
        row({ subject: "COMP", number: "6000", title: "Machine Learning" }),
      ],
      EMPTY,
      { ...OPTS, mintId: counterMinter() },
    );

    expect(plan.creates).toHaveLength(0);
    expect(plan.pendings).toHaveLength(2);
    expect(plan.pendings.map((p) => p.reason)).toEqual([
      "possible-cross-list",
      "possible-cross-list",
    ]);
  });

  it("does not duplicate a pending row already awaiting an admin decision", () => {
    const snapshot: CatalogSnapshot = {
      courses: [
        { id: "c1" as CourseId, catalogKey: "COMP 2210", title: "Fundamentals of Computing II", status: "active" },
      ],
      crosswalk: [{ catalogKey: "COMP 2210", courseId: "c1" as CourseId }],
      pendingKeys: ["COMP 2220"],
    };

    const plan = planIngest(
      [row({ subject: "COMP", number: "2220", title: "Fundamentals of Computing II" })],
      snapshot,
      { ...OPTS, mintId: counterMinter() },
    );

    expect(plan.pendings).toHaveLength(0);
    expect(plan.creates).toHaveLength(0);
  });
});
