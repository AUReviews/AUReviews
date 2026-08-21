import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildReviewReportEmail,
  operatorEmailAddress,
  sendOperatorEmail,
} from "./operator-mail";

describe("buildReviewReportEmail", () => {
  const email = buildReviewReportEmail({
    reviewId: "0f3c0a8a-1111-4222-8333-444455556666",
    reviewUrl:
      "https://aureviews.com/courses/comp-1210#review-0f3c0a8a-1111-4222-8333-444455556666",
    courseCode: "COMP 1210",
    reason: "spam",
    details: "Looks <b>copied</b>",
    reportedBySignedIn: true,
  });

  it("names the review and carries its id and link", () => {
    expect(email.subject).toContain("COMP 1210");
    expect(email.text).toContain("0f3c0a8a-1111-4222-8333-444455556666");
    expect(email.text).toContain("https://aureviews.com/courses/comp-1210#review-");
    expect(email.html).toContain('href="https://aureviews.com/courses/comp-1210#review-');
  });

  it("shows the human reason label and escapes reader text in html", () => {
    expect(email.text).toContain("Spam, impersonation, or self-review");
    expect(email.html).not.toContain("<b>copied</b>");
    expect(email.html).toContain("&lt;b&gt;copied&lt;/b&gt;");
  });

  it("says whether the reporter was signed in", () => {
    expect(email.text).toMatch(/signed-in/i);
  });
});

describe("operatorEmailAddress", () => {
  it("reads OPERATOR_EMAIL", () => {
    expect(operatorEmailAddress({ OPERATOR_EMAIL: "ops@example.org" })).toBe(
      "ops@example.org",
    );
    expect(operatorEmailAddress({})).toBeNull();
  });
});

describe("sendOperatorEmail without a Resend key", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("logs instead of sending and never throws", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("OPERATOR_EMAIL", "ops@example.org");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await sendOperatorEmail({ subject: "subj-1", text: "t", html: "<p>t</p>" });
    expect(info).toHaveBeenCalledWith(expect.stringContaining("subj-1"));
  });

  it("warns when no operator address is configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("OPERATOR_EMAIL", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await sendOperatorEmail({ subject: "s", text: "t", html: "<p>t</p>" });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("OPERATOR_EMAIL"));
  });
});
