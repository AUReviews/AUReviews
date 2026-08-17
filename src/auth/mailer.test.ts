import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSignInCodeEmail, sendSignInCodeEmail } from "./mailer";

describe("buildSignInCodeEmail", () => {
  const email = buildSignInCodeEmail("123456");

  it("carries the code, grouped for readability", () => {
    expect(email.text).toContain("123 456");
    expect(email.html).toContain("123 456");
  });

  it("contains no URL at all — Safe Links must have nothing to rewrite or pre-fetch", () => {
    expect(email.subject).not.toMatch(/https?:/i);
    expect(email.text).not.toMatch(/https?:/i);
    expect(email.html).not.toMatch(/https?:/i);
    expect(email.html).not.toContain("<a ");
  });

  it("keeps the student wording and the non-affiliation notice", () => {
    expect(email.text).toContain("verified Auburn student");
    expect(email.text).toContain("not affiliated");
    expect(email.html).toContain("verified Auburn student");
    expect(email.html).toContain("not affiliated");
  });
});

describe("sendSignInCodeEmail without a Resend key", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("logs the code in dev instead of sending", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    await sendSignInCodeEmail({
      to: "abc1234@auburn.edu",
      code: "123456",
      from: "AUReviews <no-reply@mail.aureviews.com>",
    });

    expect(info).toHaveBeenCalledWith(expect.stringContaining("123456"));
  });

  it("refuses in production — a live code must never hit logs", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("NODE_ENV", "production");

    await expect(
      sendSignInCodeEmail({ to: "abc1234@auburn.edu", code: "123456", from: "x" }),
    ).rejects.toThrow(/RESEND_API_KEY/);
  });
});
