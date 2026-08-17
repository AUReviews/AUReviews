import { describe, expect, it } from "vitest";
import {
  AUBURN_DOMAINS,
  isAuburnStudentEmail,
  isUsernameOnly,
  splitTypedEmail,
} from "./email";

describe("splitTypedEmail — username field with a fixed domain suffix", () => {
  it("passes a bare username through and keeps the current domain", () => {
    expect(splitTypedEmail("abc1234", "auburn.edu")).toEqual({
      local: "abc1234",
      domain: "auburn.edu",
    });
  });

  it("splits a pasted full address and follows a known domain", () => {
    expect(splitTypedEmail("abc1234@tigermail.auburn.edu", "auburn.edu")).toEqual({
      local: "abc1234",
      domain: "tigermail.auburn.edu",
    });
    expect(splitTypedEmail("ABC1234@Auburn.EDU ", "tigermail.auburn.edu")).toEqual({
      local: "ABC1234",
      domain: "auburn.edu",
    });
  });

  it("leaves an @ typed mid-way exactly as typed — no keystroke is swallowed", () => {
    // Typing "abc1234@tigermail.auburn.edu" one key at a time passes through
    // these; each must round-trip until the domain is complete.
    expect(splitTypedEmail("abc1234@", "auburn.edu")).toEqual({
      local: "abc1234@",
      domain: "auburn.edu",
    });
    expect(splitTypedEmail("abc1234@tigermail.auburn.ed", "auburn.edu")).toEqual({
      local: "abc1234@tigermail.auburn.ed",
      domain: "auburn.edu",
    });
  });

  it("leaves an unknown domain as typed rather than guessing", () => {
    expect(splitTypedEmail("someone@gmail.com", "auburn.edu")).toEqual({
      local: "someone@gmail.com",
      domain: "auburn.edu",
    });
  });

  it("splits at the first @, so a stray second @ can't smuggle a domain", () => {
    expect(splitTypedEmail("a@b@auburn.edu", "auburn.edu")).toEqual({
      local: "a@b@auburn.edu",
      domain: "auburn.edu",
    });
  });

  it("assembles into an address the gate accepts, for every offered domain", () => {
    for (const domain of AUBURN_DOMAINS) {
      const { local } = splitTypedEmail("abc1234", domain);
      expect(isAuburnStudentEmail(`${local}@${domain}`)).toBe(true);
    }
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
