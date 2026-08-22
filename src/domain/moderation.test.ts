import { describe, expect, it } from "vitest";
import {
  REPORT_REASONS,
  REPORT_DETAILS_MAX_LENGTH,
  validateReviewReport,
} from "./moderation";

describe("validateReviewReport", () => {
  it("accepts a known reason with no details", () => {
    const r = validateReviewReport({ reason: "off-topic", details: "" });
    expect(r).toEqual({ ok: true, reason: "off-topic", details: null });
  });

  it("accepts trimmed details under the cap", () => {
    const r = validateReviewReport({ reason: "spam", details: "  copy-pasted  " });
    expect(r).toEqual({ ok: true, reason: "spam", details: "copy-pasted" });
  });

  it("rejects an unknown or missing reason", () => {
    expect(validateReviewReport({ reason: "bogus", details: "" })).toEqual({
      ok: false,
      field: "reason",
      message: expect.any(String),
    });
    expect(validateReviewReport({ reason: null, details: "" }).ok).toBe(false);
  });

  it("rejects over-long details", () => {
    const r = validateReviewReport({
      reason: "other",
      details: "x".repeat(REPORT_DETAILS_MAX_LENGTH + 1),
    });
    expect(r).toMatchObject({ ok: false, field: "details" });
  });

  it("requires details when the reason is 'other'", () => {
    expect(validateReviewReport({ reason: "other", details: " " })).toMatchObject({
      ok: false,
      field: "details",
    });
  });

  it("offers only neutral, non-accusatory reason labels (§10 Roommates line)", () => {
    for (const reason of REPORT_REASONS) {
      expect(reason.label).not.toMatch(/\b(lie|liar|false|defam|libel)/i);
    }
  });
});
