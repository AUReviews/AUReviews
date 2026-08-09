import { describe, expect, it } from "vitest";
import { mintCourseFromRaw } from "./index";

describe("mintCourseFromRaw", () => {
  it("mints a durable id and a normalized catalog key from a raw row", () => {
    const minted = mintCourseFromRaw({
      subject: " comp ",
      number: " 2210 ",
      title: "  Data Structures  ",
    });

    expect(minted.catalogKey).toBe("COMP 2210");
    expect(minted.title).toBe("Data Structures");
    expect(minted.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("mints a fresh id per row (identity is not the catalog key)", () => {
    const row = { subject: "COMP", number: "2210", title: "Data Structures" };
    expect(mintCourseFromRaw(row).id).not.toEqual(mintCourseFromRaw(row).id);
  });
});
