import { describe, expect, it } from "vitest";
import {
  type BrowseCourse,
  DEFAULT_SORT,
  formatAverage,
  formatReviewCount,
  sortBrowseCourses,
} from "./browse";

/**
 * A tiny catalog fixture, intentionally NOT in catalog order so a passing
 * "default sort = COMP number ascending" test can't be an accident of input
 * order. All averages are null / N=0, mirroring the pre-review v1 state (#20);
 * a couple of rows carry synthetic averages purely to exercise the numeric and
 * null-handling sort paths that #6 will make real.
 */
function course(overrides: Partial<BrowseCourse> & Pick<BrowseCourse, "number" | "title">): BrowseCourse {
  return {
    id: `id-${overrides.number}`,
    subject: "COMP",
    status: "active",
    overall: null,
    difficulty: null,
    workload: null,
    reviewCount: 0,
    ...overrides,
  };
}

const catalog: BrowseCourse[] = [
  course({ number: "3270", title: "Introduction to Algorithms" }),
  course({ number: "1210", title: "Fundamentals of Computing I" }),
  course({ number: "2210", title: "Fundamentals of Computing II" }),
  course({ number: "5350", title: "Database Systems I", status: "retired" }),
];

describe("DEFAULT_SORT", () => {
  it("is catalog order — COMP number ascending", () => {
    expect(DEFAULT_SORT).toEqual({ key: "code", direction: "asc" });
  });
});

describe("sortBrowseCourses", () => {
  it("does not mutate its input", () => {
    const input = [...catalog];
    const snapshot = JSON.stringify(input);
    sortBrowseCourses(input, "title", "asc");
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("default sort lists courses in COMP-number order", () => {
    const sorted = sortBrowseCourses(catalog, DEFAULT_SORT.key, DEFAULT_SORT.direction);
    expect(sorted.map((c) => c.number)).toEqual(["1210", "2210", "3270", "5350"]);
  });

  it("sorts by code descending", () => {
    const sorted = sortBrowseCourses(catalog, "code", "desc");
    expect(sorted.map((c) => c.number)).toEqual(["5350", "3270", "2210", "1210"]);
  });

  it("orders code numerically, not lexicographically", () => {
    const rows = [
      course({ number: "500", title: "Five hundred" }),
      course({ number: "1000", title: "One thousand" }),
      course({ number: "60", title: "Sixty" }),
    ];
    const sorted = sortBrowseCourses(rows, "code", "asc");
    expect(sorted.map((c) => c.number)).toEqual(["60", "500", "1000"]);
  });

  it("sorts by title alphabetically, case-insensitively", () => {
    const sorted = sortBrowseCourses(catalog, "title", "asc");
    expect(sorted.map((c) => c.title)).toEqual([
      "Database Systems I",
      "Fundamentals of Computing I",
      "Fundamentals of Computing II",
      "Introduction to Algorithms",
    ]);
  });

  it("sorts by reviews count numerically", () => {
    const rows = [
      course({ number: "1", title: "A", reviewCount: 3 }),
      course({ number: "2", title: "B", reviewCount: 0 }),
      course({ number: "3", title: "C", reviewCount: 12 }),
    ];
    expect(sortBrowseCourses(rows, "reviews", "desc").map((c) => c.reviewCount)).toEqual([12, 3, 0]);
    expect(sortBrowseCourses(rows, "reviews", "asc").map((c) => c.reviewCount)).toEqual([0, 3, 12]);
  });

  it("keeps missing averages (null) last, ascending AND descending", () => {
    const rows = [
      course({ number: "1", title: "Has avg", overall: 4.2, reviewCount: 5 }),
      course({ number: "2", title: "No avg" }), // overall null
      course({ number: "3", title: "Lower avg", overall: 2.1, reviewCount: 5 }),
    ];
    // ascending: real values ascend, null sinks to the bottom
    expect(sortBrowseCourses(rows, "overall", "asc").map((c) => c.title)).toEqual([
      "Lower avg",
      "Has avg",
      "No avg",
    ]);
    // descending: real values descend, null STILL at the bottom (not floated up)
    expect(sortBrowseCourses(rows, "overall", "desc").map((c) => c.title)).toEqual([
      "Has avg",
      "Lower avg",
      "No avg",
    ]);
  });

  it("breaks ties by catalog order for a stable, predictable table", () => {
    // Every row has the same (null) overall, so the tiebreak is catalog order
    // regardless of the requested direction.
    const rows = [
      course({ number: "3270", title: "C" }),
      course({ number: "1210", title: "A" }),
      course({ number: "2210", title: "B" }),
    ];
    expect(sortBrowseCourses(rows, "overall", "asc").map((c) => c.number)).toEqual([
      "1210",
      "2210",
      "3270",
    ]);
    expect(sortBrowseCourses(rows, "overall", "desc").map((c) => c.number)).toEqual([
      "1210",
      "2210",
      "3270",
    ]);
  });
});

describe("formatAverage", () => {
  it("shows an em dash when the low-data gate withheld the average", () => {
    // The gate itself (threshold and all) lives in domain gateAverage; a null
    // arriving here just formats as "—".
    expect(formatAverage(null)).toBe("—");
  });

  it("shows the two-decimal mean when one is reportable", () => {
    expect(formatAverage(3.124)).toBe("3.12");
    expect(formatAverage(4)).toBe("4.00");
  });
});

describe("formatReviewCount", () => {
  it("shows the real count, including zero", () => {
    expect(formatReviewCount(0)).toBe("0");
    expect(formatReviewCount(122)).toBe("122");
  });
});
