import { describe, expect, it } from "vitest";
import {
  computeIdentityHash,
  isAuburnStudentEmail,
  normalizeEmail,
} from "./anonymity";

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Jane.Doe@Auburn.EDU ")).toBe("jane.doe@auburn.edu");
  });

  it("collapses surrounding whitespace only, not inner", () => {
    // Addresses don't contain inner spaces; we only strip the edges.
    expect(normalizeEmail("\tabc1234@tigermail.auburn.edu\n")).toBe(
      "abc1234@tigermail.auburn.edu",
    );
  });
});

describe("isAuburnStudentEmail", () => {
  it("accepts @auburn.edu", () => {
    expect(isAuburnStudentEmail("abc1234@auburn.edu")).toBe(true);
  });

  it("accepts @tigermail.auburn.edu", () => {
    expect(isAuburnStudentEmail("abc1234@tigermail.auburn.edu")).toBe(true);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(isAuburnStudentEmail("  ABC1234@AUBURN.EDU  ")).toBe(true);
  });

  it("rejects non-Auburn domains", () => {
    expect(isAuburnStudentEmail("someone@gmail.com")).toBe(false);
    expect(isAuburnStudentEmail("someone@ua.edu")).toBe(false);
  });

  it("rejects look-alike domains that merely contain the string", () => {
    // Substring matches must not pass — only a true suffix on the domain.
    expect(isAuburnStudentEmail("attacker@auburn.edu.evil.com")).toBe(false);
    expect(isAuburnStudentEmail("attacker@notauburn.edu")).toBe(false);
    expect(isAuburnStudentEmail("attacker@fauburn.edu")).toBe(false);
  });

  it("rejects malformed / empty input", () => {
    expect(isAuburnStudentEmail("")).toBe(false);
    expect(isAuburnStudentEmail("not-an-email")).toBe(false);
    expect(isAuburnStudentEmail("@auburn.edu")).toBe(false);
  });
});

describe("computeIdentityHash", () => {
  const pepper = "test-pepper-value";

  it("is a 64-char lowercase hex HMAC-SHA256 digest", () => {
    const hash = computeIdentityHash(pepper, "abc1234@auburn.edu");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable for the same normalized address", () => {
    const a = computeIdentityHash(pepper, "abc1234@auburn.edu");
    const b = computeIdentityHash(pepper, "  ABC1234@Auburn.edu ");
    expect(a).toBe(b);
  });

  it("differs for different addresses", () => {
    const a = computeIdentityHash(pepper, "abc1234@auburn.edu");
    const b = computeIdentityHash(pepper, "xyz9999@auburn.edu");
    expect(a).not.toBe(b);
  });

  it("differs when the pepper changes (the pepper is load-bearing)", () => {
    const a = computeIdentityHash("pepper-one", "abc1234@auburn.edu");
    const b = computeIdentityHash("pepper-two", "abc1234@auburn.edu");
    expect(a).not.toBe(b);
  });

  it("throws on an empty pepper so a misconfiguration can't silently weaken hashing", () => {
    expect(() => computeIdentityHash("", "abc1234@auburn.edu")).toThrow();
  });
});
