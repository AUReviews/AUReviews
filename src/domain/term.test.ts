import { describe, expect, it } from "vitest";
import {
  FALL_2007_TERM_CODE,
  formatTerm,
  isIngestibleTermCode,
  parseTermCode,
  rollupOfferedSemesters,
} from "./term";

describe("parseTermCode", () => {
  // Codes below validated against the live Banner dropdown (issue #23): the
  // 4-digit prefix is the academic year's spring calendar year, so Fall sits
  // one year behind its prefix.
  it("parses a Fall code (prefix is calendar year + 1)", () => {
    expect(parseTermCode("202710")).toEqual({
      code: "202710",
      semester: "Fall",
      year: 2026,
    });
    expect(parseTermCode("200810")).toEqual({
      code: "200810",
      semester: "Fall",
      year: 2007,
    });
  });

  it("parses Spring and Summer codes (prefix is the calendar year)", () => {
    expect(parseTermCode("202020")).toEqual({
      code: "202020",
      semester: "Spring",
      year: 2020,
    });
    expect(parseTermCode("202630")).toEqual({
      code: "202630",
      semester: "Summer",
      year: 2026,
    });
  });

  it("rejects malformed or unknown codes", () => {
    expect(parseTermCode("")).toBeNull();
    expect(parseTermCode("None")).toBeNull();
    expect(parseTermCode("202740")).toBeNull(); // unknown semester digit
    expect(parseTermCode("202711")).toBeNull(); // trailing digit must be 0
    expect(parseTermCode("20271")).toBeNull(); // wrong length
    expect(parseTermCode("2027100")).toBeNull();
  });
});

describe("formatTerm", () => {
  it("renders the human term label", () => {
    expect(formatTerm(parseTermCode("202520")!)).toBe("Spring 2025");
    expect(formatTerm(parseTermCode("200810")!)).toBe("Fall 2007");
  });
});

describe("isIngestibleTermCode", () => {
  it("accepts valid codes from Fall 2007 onward", () => {
    expect(isIngestibleTermCode(FALL_2007_TERM_CODE)).toBe(true);
    expect(isIngestibleTermCode("202710")).toBe(true);
  });

  it("rejects codes before Fall 2007 and invalid codes", () => {
    expect(isIngestibleTermCode("200730")).toBe(false); // Summer 2007
    expect(isIngestibleTermCode("199810")).toBe(false);
    expect(isIngestibleTermCode("garbage")).toBe(false);
    expect(isIngestibleTermCode("")).toBe(false);
  });
});

describe("rollupOfferedSemesters", () => {
  it("collapses offering history into distinct semesters in Fall/Spring/Summer order", () => {
    expect(
      rollupOfferedSemesters(["202020", "202110", "201920", "202030"]),
    ).toEqual(["Fall", "Spring", "Summer"]);
  });

  it("orders canonically regardless of input order", () => {
    expect(rollupOfferedSemesters(["202030", "202020"])).toEqual([
      "Spring",
      "Summer",
    ]);
  });

  it("deduplicates repeated semesters across years", () => {
    expect(rollupOfferedSemesters(["200810", "200910", "202510"])).toEqual([
      "Fall",
    ]);
  });

  it("ignores unparseable codes and returns [] when nothing remains", () => {
    expect(rollupOfferedSemesters(["bogus", ""])).toEqual([]);
    expect(rollupOfferedSemesters([])).toEqual([]);
    expect(rollupOfferedSemesters(["bogus", "202020"])).toEqual(["Spring"]);
  });
});
