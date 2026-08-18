import { describe, expect, it } from "vitest";
import {
  AUBURN_DOMAIN,
  isAuburnStudentEmail,
  isUsernameOnly,
  resolveTypedUsername,
} from "./email";

describe("resolveTypedUsername — username field with the fixed @auburn.edu suffix", () => {
  it("passes a bare username through", () => {
    expect(resolveTypedUsername("abc1234")).toBe("abc1234");
  });

  it("reduces a pasted full @auburn.edu address to its username, any case", () => {
    expect(resolveTypedUsername("abc1234@auburn.edu")).toBe("abc1234");
    expect(resolveTypedUsername("ABC1234@Auburn.EDU ")).toBe("ABC1234");
  });

  it("leaves an @ typed mid-way exactly as typed — no keystroke is swallowed", () => {
    // Typing "abc1234@auburn.edu" one key at a time passes through these; each
    // must round-trip until the domain is complete.
    expect(resolveTypedUsername("abc1234@")).toBe("abc1234@");
    expect(resolveTypedUsername("abc1234@auburn.ed")).toBe("abc1234@auburn.ed");
  });

  it("leaves any other domain as typed rather than guessing", () => {
    expect(resolveTypedUsername("someone@gmail.com")).toBe("someone@gmail.com");
    // tigermail is no longer accepted (owner decision, PR #48).
    expect(resolveTypedUsername("abc1234@tigermail.auburn.edu")).toBe(
      "abc1234@tigermail.auburn.edu",
    );
  });

  it("splits at the first @, so a stray second @ can't smuggle a domain", () => {
    expect(resolveTypedUsername("a@b@auburn.edu")).toBe("a@b@auburn.edu");
  });

  it("assembles into an address the gate accepts", () => {
    const local = resolveTypedUsername("abc1234@auburn.edu");
    expect(isAuburnStudentEmail(`${local}@${AUBURN_DOMAIN}`)).toBe(true);
  });
});

describe("isUsernameOnly", () => {
  it("accepts a bare username", () => {
    expect(isUsernameOnly("abc1234")).toBe(true);
  });

  it("rejects empty/blank and anything holding an @", () => {
    expect(isUsernameOnly("")).toBe(false);
    expect(isUsernameOnly("   ")).toBe(false);
    expect(isUsernameOnly("abc1234@")).toBe(false);
    expect(isUsernameOnly("a@b")).toBe(false);
  });
});
