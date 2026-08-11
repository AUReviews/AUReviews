import { describe, expect, it } from "vitest";
import {
  mintCourseId,
  mintInstructorId,
  normalizeCatalogKey,
  normalizeInstructorName,
} from "./identity";

describe("mintCourseId", () => {
  it("mints unique ids", () => {
    const a = mintCourseId();
    const b = mintCourseId();
    expect(a).not.toEqual(b);
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

describe("mintInstructorId", () => {
  it("mints unique ids", () => {
    const a = mintInstructorId();
    const b = mintInstructorId();
    expect(a).not.toEqual(b);
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

describe("normalizeInstructorName", () => {
  // Banner pads names with irregular inner whitespace ("Daniela   Marghitu").
  it("collapses whitespace, trims, and uppercases", () => {
    expect(normalizeInstructorName("Daniela   Marghitu ")).toBe(
      "DANIELA MARGHITU",
    );
  });

  it("treats case/whitespace variants as the same key", () => {
    expect(normalizeInstructorName("daniela marghitu")).toBe(
      normalizeInstructorName("Daniela   MARGHITU"),
    );
  });
});

describe("normalizeCatalogKey", () => {
  it("uppercases and trims subject and number", () => {
    expect(normalizeCatalogKey({ subject: " comp ", number: " 2210 " })).toBe(
      "COMP 2210",
    );
  });

  it("treats case/whitespace variants as the same key", () => {
    const a = normalizeCatalogKey({ subject: "comp", number: "2210" });
    const b = normalizeCatalogKey({ subject: "COMP", number: "2210" });
    expect(a).toBe(b);
  });
});
