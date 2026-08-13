import { describe, expect, it } from "vitest";
import {
  escapeLikePattern,
  normalizeCourseSearchQuery,
  toCourseOption,
} from "./course-search";

describe("normalizeCourseSearchQuery", () => {
  it("trims and collapses internal whitespace", () => {
    expect(normalizeCourseSearchQuery("  comp   3270 ")).toBe("comp 3270");
  });

  it("rejects queries shorter than two characters", () => {
    expect(normalizeCourseSearchQuery("")).toBeNull();
    expect(normalizeCourseSearchQuery(" ")).toBeNull();
    expect(normalizeCourseSearchQuery("c")).toBeNull();
  });

  it("keeps a two-character query", () => {
    expect(normalizeCourseSearchQuery("co")).toBe("co");
  });

  it("caps runaway input length", () => {
    const long = "a".repeat(500);
    expect(normalizeCourseSearchQuery(long)).toBe("a".repeat(80));
  });
});

describe("escapeLikePattern", () => {
  it("escapes LIKE wildcards and the escape character", () => {
    expect(escapeLikePattern("100%_done\\")).toBe("100\\%\\_done\\\\");
  });

  it("passes plain text through", () => {
    expect(escapeLikePattern("comp 3270")).toBe("comp 3270");
  });
});

describe("toCourseOption", () => {
  it("builds the slug and display label from a catalog row", () => {
    expect(
      toCourseOption({
        id: "id-1",
        subject: "COMP",
        number: "3270",
        title: "Introduction to Algorithms",
      }),
    ).toEqual({
      id: "id-1",
      slug: "comp-3270",
      label: "COMP 3270 · Introduction to Algorithms",
    });
  });
});
