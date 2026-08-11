import { afterEach, describe, expect, it } from "vitest";
import { currentSelectableTerms, reviewTermWindowMode } from "./review-window";

const original = process.env.REVIEW_TERM_WINDOW;

afterEach(() => {
  if (original === undefined) delete process.env.REVIEW_TERM_WINDOW;
  else process.env.REVIEW_TERM_WINDOW = original;
});

describe("reviewTermWindowMode — env config (§4)", () => {
  it("defaults to the launch (4-year) window when unset", () => {
    delete process.env.REVIEW_TERM_WINDOW;
    expect(reviewTermWindowMode()).toBe("launch");
  });

  it("reads a valid mode, case-insensitively", () => {
    process.env.REVIEW_TERM_WINDOW = "STEADY";
    expect(reviewTermWindowMode()).toBe("steady");
  });

  it("falls back to the default on an unrecognized value rather than throwing", () => {
    process.env.REVIEW_TERM_WINDOW = "nonsense";
    expect(reviewTermWindowMode()).toBe("launch");
  });
});

describe("currentSelectableTerms", () => {
  it("returns the launch window's 12 terms by default", () => {
    delete process.env.REVIEW_TERM_WINDOW;
    expect(currentSelectableTerms(new Date("2026-08-15T12:00:00Z"))).toHaveLength(12);
  });

  it("returns 3 terms under the steady window", () => {
    process.env.REVIEW_TERM_WINDOW = "steady";
    expect(currentSelectableTerms(new Date("2026-08-15T12:00:00Z"))).toHaveLength(3);
  });
});
