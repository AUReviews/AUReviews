import { describe, expect, it } from "vitest";
import {
  CONCERN_KINDS,
  CONCERN_MESSAGE_MAX_LENGTH,
  REPORT_REASONS,
  REPORT_DETAILS_MAX_LENGTH,
  validateConcern,
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

describe("validateConcern", () => {
  it("accepts a kind + message, with optional contact and page", () => {
    const r = validateConcern({
      kind: "bug",
      message: "  The search box eats the last character. ",
      contactEmail: "",
      pageUrl: "https://aureviews.com/courses/comp-1210",
    });
    expect(r).toEqual({
      ok: true,
      kind: "bug",
      message: "The search box eats the last character.",
      contactEmail: null,
      pageUrl: "https://aureviews.com/courses/comp-1210",
    });
  });

  it("rejects an unknown kind", () => {
    expect(
      validateConcern({ kind: "nope", message: "hello there", contactEmail: "", pageUrl: "" }),
    ).toMatchObject({ ok: false, field: "kind" });
  });

  it("rejects an empty or over-long message", () => {
    expect(
      validateConcern({ kind: "bug", message: "   ", contactEmail: "", pageUrl: "" }),
    ).toMatchObject({ ok: false, field: "message" });
    expect(
      validateConcern({
        kind: "bug",
        message: "x".repeat(CONCERN_MESSAGE_MAX_LENGTH + 1),
        contactEmail: "",
        pageUrl: "",
      }),
    ).toMatchObject({ ok: false, field: "message" });
  });

  it("rejects a malformed contact email but does not require one — the form is ungated", () => {
    expect(
      validateConcern({ kind: "removal", message: "please remove", contactEmail: "not-an-email", pageUrl: "" }),
    ).toMatchObject({ ok: false, field: "contactEmail" });
    expect(
      validateConcern({ kind: "removal", message: "please remove", contactEmail: "a@example.org", pageUrl: "" }),
    ).toMatchObject({ ok: true, contactEmail: "a@example.org" });
  });

  it("drops a page url that is not http(s)", () => {
    expect(
      validateConcern({ kind: "bug", message: "broken", contactEmail: "", pageUrl: "javascript:alert(1)" }),
    ).toMatchObject({ ok: true, pageUrl: null });
  });

  it("exposes the three concern kinds from §11", () => {
    expect(CONCERN_KINDS.map((k) => k.value)).toEqual(["bug", "removal", "other"]);
  });
});
