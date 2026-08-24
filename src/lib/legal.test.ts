import { describe, expect, it } from "vitest";
import {
  ATTORNEY_CONFIRM_ITEMS,
  LEGAL_LINKS,
  NON_AFFILIATION_DISCLAIMER,
  PROHIBITED_CONTENT,
  RETENTION_DAYS,
  legalPageHref,
} from "./legal";

describe("NON_AFFILIATION_DISCLAIMER (v1-spec §10)", () => {
  it("carries every required clause of the §10 footer language", () => {
    expect(NON_AFFILIATION_DISCLAIMER).toContain("independent, student-run");
    expect(NON_AFFILIATION_DISCLAIMER).toContain("not affiliated with");
    expect(NON_AFFILIATION_DISCLAIMER).toContain("Auburn University");
    expect(NON_AFFILIATION_DISCLAIMER).toContain("trademarks of Auburn University");
    expect(NON_AFFILIATION_DISCLAIMER).toContain(
      "used here only to identify the institution",
    );
  });
});

describe("LEGAL_LINKS", () => {
  it("lists the three required legal pages, each on its own route", () => {
    expect(LEGAL_LINKS.map((l) => l.href)).toEqual(["/terms", "/privacy", "/guidelines"]);
    expect(legalPageHref("terms")).toBe("/terms");
    expect(legalPageHref("privacy")).toBe("/privacy");
    expect(legalPageHref("guidelines")).toBe("/guidelines");
  });
});

describe("PROHIBITED_CONTENT (v1-spec §11)", () => {
  it("names every §11 takedown-eligible category", () => {
    const text = PROHIBITED_CONTENT.map((p) => `${p.title} ${p.detail}`).join(" ").toLowerCase();
    for (const needle of [
      "misconduct",
      "protected characteristic",
      "appearance",
      "contact",
      "tas",
      "other students",
      "profanity",
      "wrong course",
      "spam",
      "impersonation",
      "self-review",
    ]) {
      expect(text, `missing "${needle}"`).toContain(needle);
    }
  });

  it("never makes the RMP claims §11 rules out", () => {
    const text = PROHIBITED_CONTENT.map((p) => `${p.title} ${p.detail}`).join(" ").toLowerCase();
    expect(text).not.toContain("one review per");
    expect(text).not.toContain("read every review");
    expect(text).not.toContain("your data becomes");
  });
});

describe("retention and attorney flags", () => {
  it("uses the §11 default windows", () => {
    expect(RETENTION_DAYS).toEqual({ deleted: 30, removed: 90 });
  });

  it("lists the wording the attorney consult must confirm", () => {
    const joined = ATTORNEY_CONFIRM_ITEMS.join(" ").toLowerCase();
    expect(joined).toContain("governing law");
    expect(joined).toContain("retention");
    expect(joined).toContain("name");
  });
});
