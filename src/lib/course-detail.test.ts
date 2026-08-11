import { describe, expect, it } from "vitest";
import {
  type CourseDetail,
  courseHref,
  courseSlug,
  formatCatalogYear,
  formatCourseCode,
  formatCourseDescription,
  formatCreditHours,
  formatTypicallyOffered,
  parseCourseSlug,
  reviewFormHref,
} from "./course-detail";

function detail(overrides: Partial<CourseDetail> = {}): CourseDetail {
  return {
    id: "id-1",
    subject: "COMP",
    number: "3270",
    title: "Introduction to Algorithms",
    description: "Design and analysis of algorithms.",
    creditHours: "3",
    prereqText: "Pr. COMP 2210.",
    catalogYear: "2025-2026",
    status: "active",
    overall: null,
    difficulty: null,
    workload: null,
    reviewCount: 0,
    ...overrides,
  };
}

describe("courseSlug", () => {
  it("lowercases the subject and joins it to the number", () => {
    expect(courseSlug("COMP", "3270")).toBe("comp-3270");
  });

  it("preserves an alphanumeric number", () => {
    expect(courseSlug("COMP", "3270L")).toBe("comp-3270l");
  });
});

describe("parseCourseSlug", () => {
  it("round-trips a slug back to upper-cased catalog attributes", () => {
    expect(parseCourseSlug("comp-3270")).toEqual({ subject: "COMP", number: "3270" });
  });

  it("accepts an already-upper-cased slug", () => {
    expect(parseCourseSlug("COMP-3270")).toEqual({ subject: "COMP", number: "3270" });
  });

  it("parses an alphanumeric number", () => {
    expect(parseCourseSlug("comp-3270l")).toEqual({ subject: "COMP", number: "3270L" });
  });

  it("rejects a slug with no separator", () => {
    expect(parseCourseSlug("comp3270")).toBeNull();
  });

  it("rejects an empty subject or number", () => {
    expect(parseCourseSlug("-3270")).toBeNull();
    expect(parseCourseSlug("comp-")).toBeNull();
  });

  it("rejects junk", () => {
    expect(parseCourseSlug("")).toBeNull();
    expect(parseCourseSlug("comp-3270-extra")).toBeNull();
    expect(parseCourseSlug("co mp-3270")).toBeNull();
  });

  it("round-trips with courseSlug for any catalog pair", () => {
    const parsed = parseCourseSlug(courseSlug("COMP", "1210"));
    expect(parsed).toEqual({ subject: "COMP", number: "1210" });
  });
});

describe("formatCourseCode", () => {
  it("joins subject and number with a single space", () => {
    expect(formatCourseCode("COMP", "3270")).toBe("COMP 3270");
  });
});

describe("formatCreditHours", () => {
  it("returns null when the credit token is missing", () => {
    expect(formatCreditHours(null)).toBeNull();
    expect(formatCreditHours("")).toBeNull();
  });

  it("labels a single credit in the singular", () => {
    expect(formatCreditHours("1")).toBe("1 credit hour");
  });

  it("labels multiple credits in the plural", () => {
    expect(formatCreditHours("3")).toBe("3 credit hours");
  });

  it("renders a range with an en dash and the plural label", () => {
    expect(formatCreditHours("1-3")).toBe("1–3 credit hours");
  });

  it("trims surrounding whitespace", () => {
    expect(formatCreditHours("  4 ")).toBe("4 credit hours");
  });
});

describe("formatCatalogYear", () => {
  it("stamps an academic-year range, normalized to an en dash", () => {
    // The ingest always stores a range like "2026-2027" (import.ts).
    expect(formatCatalogYear("2025-2026")).toBe("2025–2026 catalog");
  });

  it("stamps a bare value without inventing a range", () => {
    expect(formatCatalogYear("2025")).toBe("2025 catalog");
  });

  it("trims surrounding whitespace", () => {
    expect(formatCatalogYear("  2025-2026 ")).toBe("2025–2026 catalog");
  });
});

describe("formatCourseDescription", () => {
  it("returns null when there is no description", () => {
    expect(formatCourseDescription(null)).toBeNull();
    expect(formatCourseDescription("   ")).toBeNull();
  });

  it("strips the LEC./LAB. breakdown and every Pr. clause, keeping the prose (COMP 2210)", () => {
    const raw =
      "LEC. 3. LAB. 3. Pr. COMP 1210 or COMP 1213. Software development in the context of collections (e.g., lists, trees, graphs, hashtables). Communication, teamwork, and a design experience are integral course experience. Pr. COMP 1210 with a grade of C or higher.";
    expect(formatCourseDescription(raw)).toBe(
      "Software development in the context of collections (e.g., lists, trees, graphs, hashtables). Communication, teamwork, and a design experience are integral course experience.",
    );
  });

  it("strips a mid-body Coreq. clause and the SU. flag (COMP 1201)", () => {
    const raw =
      "LAB. 1.  SU. Coreq. COMP 1200. Laboratory activities focused on computer programming in a high-level language.";
    expect(formatCourseDescription(raw)).toBe(
      "Laboratory activities focused on computer programming in a high-level language.",
    );
  });

  it("strips a lone leading SU. flag (COMP 4920)", () => {
    expect(formatCourseDescription("SU. Supervised practical experience.")).toBe(
      "Supervised practical experience.",
    );
  });

  it("leaves a clean description untouched", () => {
    expect(
      formatCourseDescription("Design and analysis of algorithms."),
    ).toBe("Design and analysis of algorithms.");
  });

  it("does not mistake a mid-sentence abbreviation for a contact-hour code", () => {
    // Only a LEADING run of codes is stripped; "e.g." and "i.e." inside prose stay.
    expect(
      formatCourseDescription("LEC. 3. Topics include AI, i.e. machine learning."),
    ).toBe("Topics include AI, i.e. machine learning.");
  });

  it("returns null when nothing but codes and prereqs remain", () => {
    expect(formatCourseDescription("LEC. 3. Pr. COMP 2210.")).toBeNull();
  });
});

describe("hrefs", () => {
  it("courseHref points at the detail route", () => {
    expect(courseHref("COMP", "3270")).toBe("/courses/comp-3270");
  });

  it("reviewFormHref points at the course-scoped review placeholder route", () => {
    expect(reviewFormHref("COMP", "3270")).toBe("/courses/comp-3270/review");
  });

  it("derives both hrefs from a detail row", () => {
    const c = detail();
    expect(courseHref(c.subject, c.number)).toBe("/courses/comp-3270");
    expect(reviewFormHref(c.subject, c.number)).toBe("/courses/comp-3270/review");
  });
});

describe("formatTypicallyOffered", () => {
  it("rolls offering term codes up into a semester list", () => {
    expect(formatTypicallyOffered(["202520", "202410", "202030"])).toBe(
      "Typically offered: Fall, Spring, Summer",
    );
  });

  it("orders semesters canonically regardless of history order", () => {
    expect(formatTypicallyOffered(["202520", "201910"])).toBe(
      "Typically offered: Fall, Spring",
    );
  });

  it("returns null when there is no usable offering history", () => {
    expect(formatTypicallyOffered([])).toBeNull();
    expect(formatTypicallyOffered(["bogus"])).toBeNull();
  });
});
