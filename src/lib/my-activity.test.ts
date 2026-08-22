import { describe, expect, it } from "vitest";
import {
  type MyReview,
  groupMyReviews,
  retentionNote,
} from "./my-activity";

const base: MyReview = {
  id: "r1",
  courseSubject: "COMP",
  courseNumber: "3270",
  courseTitle: "Intro to Algorithms",
  instructorName: "A. Instructor",
  instructorUnknown: null,
  termCode: "202610",
  overall: 4,
  difficulty: 3,
  workloadHours: 8,
  body: "x".repeat(120),
  status: "published",
  edited: false,
  contested: false,
  removedReason: null,
  removedAt: null,
  deletedAt: null,
  createdAt: new Date("2026-03-01T00:00:00Z"),
  helpfulUp: 3,
  helpfulDown: 1,
};

describe("groupMyReviews", () => {
  it("splits reviews by lifecycle, newest first within each group", () => {
    const older = { ...base, id: "old", createdAt: new Date("2026-01-01T00:00:00Z") };
    const removed = {
      ...base,
      id: "rm",
      status: "removed",
      removedAt: new Date("2026-05-01T00:00:00Z"),
      removedReason: "profanity",
    };
    const deleted = {
      ...base,
      id: "del",
      status: "deleted",
      deletedAt: new Date("2026-05-02T00:00:00Z"),
    };
    const pending = { ...base, id: "pend", status: "pending" };
    const g = groupMyReviews([older, removed, base, deleted, pending]);
    expect(g.live.map((r) => r.id)).toEqual(["r1", "pend", "old"]);
    expect(g.removed.map((r) => r.id)).toEqual(["rm"]);
    expect(g.deleted.map((r) => r.id)).toEqual(["del"]);
  });

  it("drops purged tombstones (deleted with no content left)", () => {
    const tomb = { ...base, id: "t", status: "deleted", body: "", deletedAt: new Date() };
    expect(groupMyReviews([tomb, base]).deleted).toEqual([]);
    expect(groupMyReviews([tomb, base]).live.map((r) => r.id)).toEqual(["r1"]);
  });

  it("returns empty groups for no reviews", () => {
    expect(groupMyReviews([])).toEqual({ live: [], removed: [], deleted: [] });
  });
});

describe("retentionNote", () => {
  const now = new Date("2026-08-10T00:00:00Z");

  it("says how long a self-deleted review's content is still kept", () => {
    const r = {
      ...base,
      status: "deleted",
      deletedAt: new Date("2026-08-01T00:00:00Z"),
    };
    expect(retentionNote(r, now)).toBe(
      "Its content is kept for 21 more days, then permanently erased.",
    );
  });

  it("uses the 90-day window for a takedown", () => {
    const r = {
      ...base,
      status: "removed",
      removedAt: new Date("2026-08-01T00:00:00Z"),
    };
    expect(retentionNote(r, now)).toBe(
      "Its content is kept for 81 more days, then permanently erased.",
    );
  });

  it("handles the last day and a past deadline", () => {
    const r = {
      ...base,
      status: "deleted",
      deletedAt: new Date("2026-07-12T00:00:00Z"),
    };
    expect(retentionNote(r, now)).toBe(
      "Its content is kept for 1 more day, then permanently erased.",
    );
    const past = { ...r, deletedAt: new Date("2026-01-01T00:00:00Z") };
    expect(retentionNote(past, now)).toBe(
      "Its content is due to be permanently erased.",
    );
  });

  it("is null for a live review", () => {
    expect(retentionNote(base, now)).toBeNull();
  });
});

describe("excerpt", () => {
  it("flattens whitespace and truncates with an ellipsis", async () => {
    const { excerpt } = await import("./my-activity");
    expect(excerpt("a  b\n\nc")).toBe("a b c");
    expect(excerpt("word ".repeat(50), 20)).toBe("word word word word…");
  });
});
