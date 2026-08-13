import { describe, expect, it } from "vitest";
import { gateAverage, gateAverages, wilsonLowerBound } from "./aggregate";

describe("gateAverage — the N ≥ 2 low-data rule (§5)", () => {
  it("returns the average once a course has two or more reviews", () => {
    expect(gateAverage(3.125, 2)).toBe(3.125);
    expect(gateAverage(4.5, 17)).toBe(4.5);
  });

  it("withholds the average at N = 1 — one data point never earns a headline", () => {
    expect(gateAverage(5, 1)).toBeNull();
  });

  it("withholds the average at N = 0", () => {
    expect(gateAverage(null, 0)).toBeNull();
  });

  it("treats a missing average as withheld regardless of the count", () => {
    // A count without a computable average (e.g. SQL avg over zero joined rows)
    // must never surface a number.
    expect(gateAverage(null, 5)).toBeNull();
  });
});

describe("gateAverages — the gate across the metric triple", () => {
  const triple = { overall: 4, difficulty: 3, workload: 12 };

  it("passes all three through at N ≥ 2", () => {
    expect(gateAverages(triple, 2)).toEqual(triple);
  });

  it("withholds all three below N = 2", () => {
    expect(gateAverages(triple, 1)).toEqual({
      overall: null,
      difficulty: null,
      workload: null,
    });
  });
});

describe("wilsonLowerBound — helpful-vote ranking (§4/§5)", () => {
  it("is 0 with no votes", () => {
    expect(wilsonLowerBound(0, 0)).toBe(0);
  });

  it("stays within [0, 1]", () => {
    expect(wilsonLowerBound(1000, 0)).toBeLessThanOrEqual(1);
    expect(wilsonLowerBound(0, 1000)).toBeGreaterThanOrEqual(0);
  });

  it("ranks a well-attested positive score above a single upvote", () => {
    // 100 up / 5 down carries far more evidence than 1 up / 0 down, even though
    // the raw proportion of the single vote is higher (1.0 vs ~0.95).
    expect(wilsonLowerBound(100, 5)).toBeGreaterThan(wilsonLowerBound(1, 0));
  });

  it("sinks a heavily downvoted review below a mixed one", () => {
    expect(wilsonLowerBound(2, 10)).toBeLessThan(wilsonLowerBound(6, 6));
  });

  it("orders equal proportions by evidence", () => {
    expect(wilsonLowerBound(20, 20)).toBeGreaterThan(wilsonLowerBound(2, 2));
  });
});
