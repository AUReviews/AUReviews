import { describe, expect, it } from "vitest";
import {
  parsePrereqs,
  prereqCodeKey,
  prerequisiteEdges,
  type PrereqCourseRef,
} from "./prereq";

/** Terse view of a group as `code[grade]` alternatives, for readable assertions. */
function groupCodes(alternatives: PrereqCourseRef[]): string[] {
  return alternatives.map((r) =>
    r.grade ? `${r.subject} ${r.number}[${r.grade}]` : `${r.subject} ${r.number}`,
  );
}

describe("parsePrereqs", () => {
  it("returns nothing for empty/absent prereq text", () => {
    for (const input of [null, "", "   "]) {
      const parsed = parsePrereqs(input);
      expect(parsed.requirements).toEqual([]);
      expect(parsed.structured).toBe(false);
    }
  });

  it("structures a single corequisite (COMP 1201)", () => {
    const parsed = parsePrereqs("Coreq. COMP 1200.");
    expect(parsed.structured).toBe(true);
    expect(parsed.requirements).toHaveLength(1);
    const [req] = parsed.requirements;
    expect(req.relation).toBe("corequisite");
    expect(req.fallback).toBeNull();
    expect(req.groups.map((g) => groupCodes(g.alternatives))).toEqual([
      ["COMP 1200"],
    ]);
  });

  it("structures an or-group and merges the grade restatement (COMP 2210)", () => {
    // "Pr. COMP 1210 or COMP 1213. Pr. COMP 1210 with a grade of C or higher."
    const parsed = parsePrereqs(
      "Pr. COMP 1210 or COMP 1213. Pr. COMP 1210 with a grade of C or higher.",
    );
    expect(parsed.structured).toBe(true);
    // The grade-restatement clause folds into the first, not a duplicate req.
    expect(parsed.requirements).toHaveLength(1);
    const [req] = parsed.requirements;
    expect(req.relation).toBe("prerequisite");
    expect(req.groups.map((g) => groupCodes(g.alternatives))).toEqual([
      ["COMP 1210[C]", "COMP 1213"],
    ]);
  });

  it("structures an or-group and merges the grade restatement (COMP 3220)", () => {
    // "Pr. COMP 2210 or COMP 2213. Pr. COMP 2210 with a grade of C or higher."
    const parsed = parsePrereqs(
      "Pr. COMP 2210 or COMP 2213. Pr. COMP 2210 with a grade of C or higher.",
    );
    expect(parsed.requirements).toHaveLength(1);
    expect(parsed.requirements[0].groups.map((g) => groupCodes(g.alternatives))).toEqual([
      ["COMP 2210[C]", "COMP 2213"],
    ]);
  });

  it("keeps `and` groups separate and merges a two-course grade restatement (COMP 3270)", () => {
    // "Pr. COMP 2240 and (COMP 2210 or COMP 2213). Pr. COMP 2210 & 2240, both with a grade of C or higher."
    const parsed = parsePrereqs(
      "Pr. COMP 2240 and (COMP 2210 or COMP 2213). Pr. COMP 2210 & 2240, both with a grade of C or higher.",
    );
    expect(parsed.requirements).toHaveLength(1);
    const [req] = parsed.requirements;
    expect(req.groups.map((g) => groupCodes(g.alternatives))).toEqual([
      ["COMP 2240[C]"],
      ["COMP 2210[C]", "COMP 2213"],
    ]);
  });

  it("parses nested parenthetical and/or with a cross-department token (COMP 3500)", () => {
    const parsed = parsePrereqs(
      "Pr. (COMP 2710 or COMP 2713) and (COMP 3350 or COMP 3353 or ELEC 2220).",
    );
    expect(parsed.structured).toBe(true);
    const [req] = parsed.requirements;
    expect(req.groups.map((g) => groupCodes(g.alternatives))).toEqual([
      ["COMP 2710", "COMP 2713"],
      ["COMP 3350", "COMP 3353", "ELEC 2220"],
    ]);
  });

  it("parses a lone required course (COMP 3700)", () => {
    const parsed = parsePrereqs("Pr. COMP 2710.");
    expect(parsed.requirements).toHaveLength(1);
    expect(parsed.requirements[0].groups.map((g) => groupCodes(g.alternatives))).toEqual([
      ["COMP 2710"],
    ]);
  });

  it("expands a bare-number continuation to the preceding subject (COMP 2210 & 2240)", () => {
    const parsed = parsePrereqs("Pr. COMP 2210 or 2213.");
    expect(parsed.requirements[0].groups.map((g) => groupCodes(g.alternatives))).toEqual([
      ["COMP 2210", "COMP 2213"],
    ]);
  });

  it("falls back to verbatim prose for a clause it cannot confidently structure", () => {
    const parsed = parsePrereqs("Pr. Departmental approval.");
    expect(parsed.structured).toBe(false);
    expect(parsed.requirements).toHaveLength(1);
    const [req] = parsed.requirements;
    expect(req.relation).toBe("prerequisite");
    expect(req.groups).toEqual([]);
    expect(req.fallback).toBe("Pr. Departmental approval.");
  });

  it("falls back per-clause: a structured clause and a prose clause coexist", () => {
    const parsed = parsePrereqs("Pr. COMP 3270. Pr. Senior standing.");
    expect(parsed.structured).toBe(true);
    expect(parsed.requirements).toHaveLength(2);
    expect(parsed.requirements[0].groups.map((g) => groupCodes(g.alternatives))).toEqual([
      ["COMP 3270"],
    ]);
    expect(parsed.requirements[1].groups).toEqual([]);
    expect(parsed.requirements[1].fallback).toBe("Pr. Senior standing.");
  });

  it("treats a clause with unknown prose mixed with a course as a verbatim fallback", () => {
    // "or equivalent" is not a course token — don't half-structure it.
    const parsed = parsePrereqs("Pr. COMP 2210 or equivalent.");
    expect(parsed.structured).toBe(false);
    expect(parsed.requirements[0].groups).toEqual([]);
    expect(parsed.requirements[0].fallback).toBe("Pr. COMP 2210 or equivalent.");
  });
});

describe("prerequisiteEdges", () => {
  it("returns the distinct prerequisite course refs, excluding corequisites", () => {
    const edges = prerequisiteEdges(
      "Pr. (COMP 2710 or COMP 2713) and (COMP 3350 or COMP 3353 or ELEC 2220).",
    );
    expect(edges.map(prereqCodeKey)).toEqual([
      "COMP 2710",
      "COMP 2713",
      "COMP 3350",
      "COMP 3353",
      "ELEC 2220",
    ]);
  });

  it("deduplicates a course restated across clauses (COMP 2210)", () => {
    const edges = prerequisiteEdges(
      "Pr. COMP 1210 or COMP 1213. Pr. COMP 1210 with a grade of C or higher.",
    );
    expect(edges.map(prereqCodeKey)).toEqual(["COMP 1210", "COMP 1213"]);
  });

  it("excludes corequisite courses from the prerequisite edge set", () => {
    expect(prerequisiteEdges("Coreq. COMP 1200.")).toEqual([]);
  });

  it("still extracts course tokens from an unparseable clause so the graph stays complete", () => {
    const edges = prerequisiteEdges("Pr. COMP 2210 or equivalent.");
    expect(edges.map(prereqCodeKey)).toEqual(["COMP 2210"]);
  });

  it("returns nothing for absent prereq text", () => {
    expect(prerequisiteEdges(null)).toEqual([]);
  });
});

describe("prereqCodeKey", () => {
  it("normalizes subject casing and spacing to a comparable key", () => {
    expect(prereqCodeKey({ subject: "comp", number: "2210" })).toBe("COMP 2210");
  });
});
