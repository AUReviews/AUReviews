import { describe, expect, it } from "vitest";
import {
  RETENTION_DAYS,
  canContestRemoval,
  canEditReview,
  purgeDeadline,
  removalReasonLabel,
  reviewLifecycle,
} from "./activity";

const at = (iso: string) => new Date(iso);

describe("reviewLifecycle", () => {
  it("maps the four stored statuses to the author-facing lifecycle", () => {
    expect(reviewLifecycle("published")).toBe("live");
    expect(reviewLifecycle("pending")).toBe("live");
    expect(reviewLifecycle("removed")).toBe("removed");
    expect(reviewLifecycle("deleted")).toBe("deleted");
  });

  it("treats an unknown status as removed — never silently live", () => {
    expect(reviewLifecycle("weird")).toBe("removed");
  });
});

describe("canEditReview / canContestRemoval", () => {
  it("only live reviews can be edited or self-deleted", () => {
    expect(canEditReview("published")).toBe(true);
    expect(canEditReview("pending")).toBe(true);
    expect(canEditReview("removed")).toBe(false);
    expect(canEditReview("deleted")).toBe(false);
  });

  it("a removal can be contested exactly once", () => {
    expect(canContestRemoval({ status: "removed", contested: false })).toBe(true);
    expect(canContestRemoval({ status: "removed", contested: true })).toBe(false);
    expect(canContestRemoval({ status: "published", contested: false })).toBe(false);
    expect(canContestRemoval({ status: "deleted", contested: false })).toBe(false);
  });
});

describe("purgeDeadline", () => {
  it("self-deletes keep content for ~30 days from deletion", () => {
    expect(RETENTION_DAYS.deleted).toBe(30);
    const d = purgeDeadline({
      status: "deleted",
      deletedAt: at("2026-08-01T00:00:00Z"),
      removedAt: null,
    });
    expect(d).toEqual(at("2026-08-31T00:00:00Z"));
  });

  it("admin takedowns keep content for ~90 days from removal", () => {
    expect(RETENTION_DAYS.removed).toBe(90);
    const d = purgeDeadline({
      status: "removed",
      deletedAt: null,
      removedAt: at("2026-08-01T00:00:00Z"),
    });
    expect(d).toEqual(at("2026-10-30T00:00:00Z"));
  });

  it("is null for a live review or one missing its timestamp", () => {
    expect(
      purgeDeadline({ status: "published", deletedAt: null, removedAt: null }),
    ).toBeNull();
    expect(
      purgeDeadline({ status: "deleted", deletedAt: null, removedAt: null }),
    ).toBeNull();
  });
});

describe("removalReasonLabel", () => {
  it("renders a guideline category by its published label", () => {
    expect(removalReasonLabel("profanity")).toBe("Profanity");
    expect(removalReasonLabel("identifying-info")).toBe(
      "Contains identifying or contact info",
    );
  });

  it("passes operator free text through, and falls back when empty", () => {
    expect(removalReasonLabel("Named a TA by full name")).toBe(
      "Named a TA by full name",
    );
    expect(removalReasonLabel(null)).toBe("Removed for a guideline violation");
    expect(removalReasonLabel("   ")).toBe("Removed for a guideline violation");
  });
});
