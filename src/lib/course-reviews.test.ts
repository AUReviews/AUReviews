import { describe, expect, it } from "vitest";
import {
  type CourseReview,
  type InstructorStats,
  buildInstructorRows,
  formatReviewDate,
  formatReviewTerm,
  instructorLabel,
  reviewPills,
  sortCourseReviews,
} from "./course-reviews";

function review(overrides: Partial<CourseReview> = {}): CourseReview {
  return {
    id: "r1",
    instructorId: null,
    instructorName: null,
    instructorUnknown: "not-listed",
    termCode: "202620",
    overall: 4,
    difficulty: 3,
    workloadHours: 10,
    body: "x".repeat(100),
    workloadShape: [],
    grade: null,
    languages: [],
    languagesOther: null,
    curved: null,
    attendance: null,
    prep: null,
    createdAt: new Date("2026-05-01T00:00:00Z"),
    helpfulUp: 0,
    helpfulDown: 0,
    ...overrides,
  };
}

describe("instructorLabel", () => {
  it("shows the instructor's name when the review names one", () => {
    expect(
      instructorLabel(review({ instructorId: "i1", instructorName: "Dana Fox" })),
    ).toBe("Dana Fox");
  });

  it("shows the explicit unknowns honestly", () => {
    expect(instructorLabel(review({ instructorUnknown: "not-listed" }))).toBe(
      "Professor not listed",
    );
    expect(instructorLabel(review({ instructorUnknown: "dont-remember" }))).toBe(
      "Professor not remembered",
    );
  });
});

describe("formatReviewTerm", () => {
  it("renders a Banner code as its human term", () => {
    expect(formatReviewTerm("202620")).toBe("Spring 2026");
    expect(formatReviewTerm("202710")).toBe("Fall 2026");
  });

  it("falls back to the raw code when unparseable", () => {
    expect(formatReviewTerm("junk")).toBe("junk");
  });
});

describe("formatReviewDate", () => {
  it("renders month + year", () => {
    expect(formatReviewDate(new Date(Date.UTC(2026, 7, 12)))).toBe("Aug 2026");
  });
});

describe("reviewPills", () => {
  it("is empty when no optional details were given", () => {
    expect(reviewPills(review())).toEqual([]);
  });

  it("collects every present detail, ambiguous values prefixed", () => {
    const pills = reviewPills(
      review({
        workloadShape: ["Project spikes", "Back-loaded"],
        grade: "A",
        languages: ["Java", "Other"],
        languagesOther: "Rust",
        curved: "Curved up",
        attendance: "Mandatory",
        prep: "Underprepared",
      }),
    );
    expect(pills).toEqual([
      "Project spikes",
      "Back-loaded",
      "Grade: A",
      "Java",
      "Rust",
      "Curved up",
      "Attendance: Mandatory",
      "Prep: Underprepared",
    ]);
  });

  it("keeps a bare Other language when no free text was given", () => {
    expect(reviewPills(review({ languages: ["Other"] }))).toEqual(["Other"]);
  });
});

describe("sortCourseReviews", () => {
  const older = review({
    id: "older",
    createdAt: new Date("2026-01-01"),
    termCode: "202520",
    helpfulUp: 100,
    helpfulDown: 5,
  });
  const newer = review({
    id: "newer",
    createdAt: new Date("2026-06-01"),
    termCode: "202620",
    helpfulUp: 1,
    helpfulDown: 0,
  });
  const sunk = review({
    id: "sunk",
    createdAt: new Date("2026-07-01"),
    termCode: "202630",
    helpfulUp: 0,
    helpfulDown: 12,
  });

  it("ranks by Wilson lower bound under 'helpful' — evidence beats ratio", () => {
    expect(sortCourseReviews([newer, sunk, older], "helpful").map((r) => r.id)).toEqual(
      ["older", "newer", "sunk"],
    );
  });

  it("breaks helpful ties by recency", () => {
    const a = review({ id: "a", createdAt: new Date("2026-01-01") });
    const b = review({ id: "b", createdAt: new Date("2026-02-01") });
    expect(sortCourseReviews([a, b], "helpful").map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("orders newest-first under 'newest'", () => {
    expect(sortCourseReviews([older, sunk, newer], "newest").map((r) => r.id)).toEqual(
      ["sunk", "newer", "older"],
    );
  });

  it("orders by term (most recent first) under 'term'", () => {
    expect(sortCourseReviews([older, newer, sunk], "term").map((r) => r.id)).toEqual(
      ["sunk", "newer", "older"],
    );
  });

  it("never mutates its input", () => {
    const input = [sunk, older];
    sortCourseReviews(input, "helpful");
    expect(input.map((r) => r.id)).toEqual(["sunk", "older"]);
  });
});

describe("buildInstructorRows", () => {
  const taught = [
    { id: "i-b", displayName: "Beth Byrd" },
    { id: "i-a", displayName: "Al Adams" },
  ];
  const stats: InstructorStats[] = [
    {
      id: "i-b",
      displayName: "Beth Byrd",
      overall: 4.5,
      difficulty: 3,
      workload: 12,
      reviewCount: 2,
    },
  ];

  it("carries one neutral-ordered (alphabetical) row per instructor who taught", () => {
    const rows = buildInstructorRows(taught, stats);
    expect(rows.map((r) => r.displayName)).toEqual(["Al Adams", "Beth Byrd"]);
  });

  it("shows true counts and withholds averages below the low-data gate", () => {
    const rows = buildInstructorRows(taught, stats);
    const beth = rows.find((r) => r.id === "i-b")!;
    expect(beth.reviewCount).toBe(2);
    expect(beth.overall).toBe(4.5);
    // Al taught but has no reviews — an honest zero row with no averages.
    const al = rows.find((r) => r.id === "i-a")!;
    expect(al.reviewCount).toBe(0);
    expect(al.overall).toBeNull();
  });

  it("passes gated averages through above the threshold", () => {
    // The launch threshold is 1 (domain MIN_REVIEWS_FOR_AVERAGE), so a
    // professor's single review already reports its numbers.
    const oneReview: InstructorStats[] = [
      { id: "i-a", displayName: "Al Adams", overall: 5, difficulty: 5, workload: 9, reviewCount: 1 },
    ];
    const rows = buildInstructorRows(taught, oneReview);
    const al = rows.find((r) => r.id === "i-a")!;
    expect(al.reviewCount).toBe(1);
    expect(al.overall).toBe(5);
    const beth = buildInstructorRows(taught, stats).find((r) => r.id === "i-b")!;
    expect(beth.overall).toBe(4.5);
    expect(beth.workload).toBe(12);
  });

  it("includes an instructor with reviews even if no offering link remains", () => {
    const orphan: InstructorStats[] = [
      { id: "i-x", displayName: "Xa Xu", overall: 3, difficulty: 3, workload: 8, reviewCount: 3 },
    ];
    const rows = buildInstructorRows(taught, orphan);
    expect(rows.map((r) => r.id)).toContain("i-x");
  });
});

