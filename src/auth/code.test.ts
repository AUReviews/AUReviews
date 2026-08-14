import { describe, expect, it } from "vitest";
import { formatCodeForDisplay, generateSignInCode } from "./code";

describe("generateSignInCode", () => {
  it("always yields exactly 6 digits, preserving leading zeros", () => {
    for (let i = 0; i < 500; i++) {
      expect(generateSignInCode()).toMatch(/^\d{6}$/);
    }
  });

  it("does not return the same code every time", () => {
    const codes = new Set(Array.from({ length: 50 }, generateSignInCode));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe("formatCodeForDisplay", () => {
  it("groups the digits for readability", () => {
    expect(formatCodeForDisplay("123456")).toBe("123 456");
  });
});
