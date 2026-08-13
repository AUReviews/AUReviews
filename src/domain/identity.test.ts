import { describe, expect, it } from "vitest";
import {
  isUuid,
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

describe("isUuid", () => {
  it("accepts minted ids, either case", () => {
    expect(isUuid(mintCourseId())).toBe(true);
    expect(isUuid("D9428888-122B-11E1-B85C-61CD3CBB3210")).toBe(true);
  });

  it("rejects anything else before it can reach a query", () => {
    expect(isUuid("")).toBe(false);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("d9428888122b11e1b85c61cd3cbb3210")).toBe(false);
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
