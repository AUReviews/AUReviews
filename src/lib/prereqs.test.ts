import { describe, expect, it } from "vitest";
import {
  buildCoursePrereqView,
  type PrereqCatalogRow,
} from "./prereqs";

/** A small catalog fixture with real COMP prereq prose. */
const CATALOG: PrereqCatalogRow[] = [
  { subject: "COMP", number: "1000", title: "Personal Computer Applications", prereqText: null },
  { subject: "COMP", number: "1210", title: "Fundamentals of Computing I", prereqText: null },
  { subject: "COMP", number: "1213", title: "Honors Fundamentals of Computing I", prereqText: null },
  {
    subject: "COMP",
    number: "2210",
    title: "Fundamentals of Computing II",
    prereqText: "Pr. COMP 1210 or COMP 1213. Pr. COMP 1210 with a grade of C or higher.",
  },
  { subject: "COMP", number: "2213", title: "Honors Fundamentals of Computing II", prereqText: null },
  { subject: "COMP", number: "2240", title: "Software Design", prereqText: "Pr. COMP 2210." },
  {
    subject: "COMP",
    number: "3270",
    title: "Introduction to Algorithms",
    prereqText: "Pr. COMP 2240 and (COMP 2210 or COMP 2213). Pr. COMP 2210 & 2240, both with a grade of C or higher.",
  },
  {
    subject: "COMP",
    number: "3500",
    title: "Introduction to Operating Systems",
    prereqText: "Pr. (COMP 2710 or COMP 2713) and (COMP 3350 or COMP 3353 or ELEC 2220).",
  },
  { subject: "COMP", number: "2710", title: "Software Construction", prereqText: null },
];

function target(subject: string, number: string): PrereqCatalogRow {
  const row = CATALOG.find((c) => c.subject === subject && c.number === number);
  if (!row) throw new Error(`missing fixture ${subject} ${number}`);
  return row;
}

describe("buildCoursePrereqView — prerequisites", () => {
  it("renders an or-group as chips linking to the referenced courses, with the grade", () => {
    const view = buildCoursePrereqView(target("COMP", "2210"), CATALOG);
    expect(view.rawFallback).toBeNull();
    expect(view.requirements).toHaveLength(1);
    const [req] = view.requirements;
    expect(req.relation).toBe("prerequisite");
    expect(req.groups).toHaveLength(1);
    expect(req.groups[0].chips).toEqual([
      { code: "COMP 1210", href: "/courses/comp-1210", grade: "C" },
      { code: "COMP 1213", href: "/courses/comp-1213", grade: null },
    ]);
  });

  it("leaves a cross-department reference not in the catalog as an unlinked chip", () => {
    const view = buildCoursePrereqView(target("COMP", "3500"), CATALOG);
    const groups = view.requirements[0].groups;
    expect(groups.map((g) => g.chips.map((c) => c.code))).toEqual([
      ["COMP 2710", "COMP 2713"],
      ["COMP 3350", "COMP 3353", "ELEC 2220"],
    ]);
    const elec = groups[1].chips.find((c) => c.code === "ELEC 2220");
    expect(elec?.href).toBeNull();
    // COMP 2710 exists in the catalog → it links.
    const comp2710 = groups[0].chips.find((c) => c.code === "COMP 2710");
    expect(comp2710?.href).toBe("/courses/comp-2710");
  });

  it("falls back to verbatim prose for an unparseable clause rather than dropping it", () => {
    const view = buildCoursePrereqView(
      { subject: "COMP", number: "4000", prereqText: "Pr. Departmental approval." },
      CATALOG,
    );
    expect(view.requirements).toHaveLength(1);
    expect(view.requirements[0].groups).toEqual([]);
    expect(view.requirements[0].fallback).toBe("Pr. Departmental approval.");
  });

  it("uses whole-text verbatim fallback when no clause parses at all", () => {
    const view = buildCoursePrereqView(
      { subject: "COMP", number: "4990", prereqText: "Permission of the department." },
      CATALOG,
    );
    expect(view.requirements).toEqual([]);
    expect(view.rawFallback).toBe("Permission of the department.");
  });

  it("is empty when a course has no prereq text and unlocks nothing", () => {
    const view = buildCoursePrereqView(target("COMP", "1000"), CATALOG);
    expect(view.requirements).toEqual([]);
    expect(view.unlocks).toEqual([]);
    expect(view.rawFallback).toBeNull();
  });
});

describe("buildCoursePrereqView — unlocks (the inverse of prerequisites)", () => {
  it("lists every course that requires this one, linked, in catalog order", () => {
    // COMP 2210 is a prereq of 2240, 3270 (both directly). Catalog order: 2240 < 3270.
    const view = buildCoursePrereqView(target("COMP", "2210"), CATALOG);
    expect(view.unlocks).toEqual([
      { code: "COMP 2240", title: "Software Design", href: "/courses/comp-2240" },
      { code: "COMP 3270", title: "Introduction to Algorithms", href: "/courses/comp-3270" },
    ]);
  });

  it("is the true inverse: 1210's unlocks contains 2210 exactly because 2210 lists 1210", () => {
    const view = buildCoursePrereqView(target("COMP", "1210"), CATALOG);
    expect(view.unlocks.map((u) => u.code)).toEqual(["COMP 2210"]);
  });

  it("never lists a course as unlocking itself", () => {
    const view = buildCoursePrereqView(target("COMP", "2210"), CATALOG);
    expect(view.unlocks.some((u) => u.code === "COMP 2210")).toBe(false);
  });

  it("does not treat a corequisite as an unlock", () => {
    const catalog: PrereqCatalogRow[] = [
      { subject: "COMP", number: "1200", title: "Intro to Computing", prereqText: null },
      { subject: "COMP", number: "1201", title: "Computing Lab", prereqText: "Coreq. COMP 1200." },
    ];
    const view = buildCoursePrereqView(catalog[0], catalog);
    expect(view.unlocks).toEqual([]);
  });
});
