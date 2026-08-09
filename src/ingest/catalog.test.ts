import { describe, expect, it } from "vitest";
import { parseCatalogHtml, parseCreditHours } from "./catalog";

/**
 * Fixture in the CourseLeaf ("Courses of Instruction") markup the bulletin
 * serves — a `.courseblock` per course, title in `.courseblocktitle`, body in
 * `.courseblockdesc`. The visible text is pasted verbatim from
 * research/auburn-course-data.md so the parser is exercised against real strings.
 */
const FIXTURE = `
<div id="courseinventorycontainer">
  <div class="courseblock">
    <p class="courseblocktitle"><strong>COMP 1000 PERSONAL COMPUTER APPLICATIONS (2)</strong></p>
    <p class="courseblockdesc">Introduction to personal computers and software applications, including word processing, spreadsheets, databases, and presentation graphics; generation and retrieval of information with the Internet; integration of data among applications.</p>
  </div>
  <div class="courseblock">
    <p class="courseblocktitle"><strong>COMP 1201 INTRODUCTION TO COMPUTING LABORATORY (1)</strong></p>
    <p class="courseblockdesc">Laboratory activities focused on computer programming in a high-level language. Coreq. COMP 1200.</p>
  </div>
  <div class="courseblock">
    <p class="courseblocktitle"><strong>COMP 2210 FUNDAMENTALS OF COMPUTING II (4)</strong></p>
    <p class="courseblockdesc">LEC. 3. LAB. 3. Pr. COMP 1210 or COMP 1213. Software development in the context of collections (e.g., lists, trees, graphs, hashtables). Communication, teamwork, and a design experience are integral course experience. Pr. COMP 1210 with a grade of C or higher.</p>
  </div>
  <div class="courseblock">
    <p class="courseblocktitle"><strong>COMP 3500 INTRODUCTION TO OPERATING SYSTEMS (3)</strong></p>
    <p class="courseblockdesc">LEC. 3. Pr. (COMP 2710 or COMP 2713) and (COMP 3350 or COMP 3353 or ELEC 2220). Structure and functions of operating systems.</p>
  </div>
</div>
`;

describe("parseCatalogHtml", () => {
  it("parses every course block into subject/number/title/credit-hours", () => {
    const rows = parseCatalogHtml(FIXTURE);

    expect(rows.map((r) => `${r.subject} ${r.number}`)).toEqual([
      "COMP 1000",
      "COMP 1201",
      "COMP 2210",
      "COMP 3500",
    ]);

    const comp2210 = rows.find((r) => r.number === "2210");
    expect(comp2210).toBeDefined();
    expect(comp2210!.subject).toBe("COMP");
    expect(comp2210!.title).toBe("FUNDAMENTALS OF COMPUTING II");
    expect(comp2210!.creditHours).toBe("4");
  });

  it("keeps a variable-credit range verbatim rather than dropping it", () => {
    const html = `
      <div class="courseblock">
        <p class="courseblocktitle"><strong>COMP 4920 PRACTICUM (1-3)</strong></p>
        <p class="courseblockdesc">Supervised practical experience.</p>
      </div>`;
    const rows = parseCatalogHtml(html);
    expect(rows[0].title).toBe("PRACTICUM");
    expect(rows[0].creditHours).toBe("1-3");
  });

  it("captures the full body verbatim as the description (lossless)", () => {
    const rows = parseCatalogHtml(FIXTURE);
    const comp1000 = rows.find((r) => r.number === "1000")!;
    expect(comp1000.description).toBe(
      "Introduction to personal computers and software applications, including word processing, spreadsheets, databases, and presentation graphics; generation and retrieval of information with the Internet; integration of data among applications.",
    );
  });

  it("captures prereq/coreq prose verbatim, and leaves prereq-free courses null", () => {
    const rows = parseCatalogHtml(FIXTURE);

    const comp1000 = rows.find((r) => r.number === "1000")!;
    expect(comp1000.prereqText).toBeNull();

    const comp1201 = rows.find((r) => r.number === "1201")!;
    expect(comp1201.prereqText).toBe("Coreq. COMP 1200.");

    const comp2210 = rows.find((r) => r.number === "2210")!;
    // Both `Pr.` sentences captured verbatim, in order.
    expect(comp2210.prereqText).toBe(
      "Pr. COMP 1210 or COMP 1213. Pr. COMP 1210 with a grade of C or higher.",
    );

    const comp3500 = rows.find((r) => r.number === "3500")!;
    // Parenthetical grouping with a cross-department (ELEC) token preserved.
    expect(comp3500.prereqText).toBe(
      "Pr. (COMP 2710 or COMP 2713) and (COMP 3350 or COMP 3353 or ELEC 2220).",
    );
  });

  it("decodes HTML entities and strips inline tags in the body", () => {
    const html = `
      <div class="courseblock">
        <p class="courseblocktitle"><strong>COMP 3350 COMPUTER ORGANIZATION &amp; ASSEMBLY (3)</strong></p>
        <p class="courseblockdesc">Registers &amp; memory&nbsp;&mdash; a <em>hands-on</em> survey.</p>
      </div>`;
    const rows = parseCatalogHtml(html);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("COMPUTER ORGANIZATION & ASSEMBLY");
    expect(rows[0].description).toBe("Registers & memory — a hands-on survey.");
  });

  it("ignores non-course markup and returns an empty list for a page with no blocks", () => {
    expect(parseCatalogHtml("<html><body><p>nothing here</p></body></html>")).toEqual([]);
  });
});

describe("parseCreditHours", () => {
  it("reads the trailing parenthetical credit token verbatim", () => {
    expect(parseCreditHours("FUNDAMENTALS OF COMPUTING II (4)")).toEqual({
      title: "FUNDAMENTALS OF COMPUTING II",
      creditHours: "4",
    });
  });

  it("reads a variable-credit range", () => {
    expect(parseCreditHours("PRACTICUM (1-3)")).toEqual({
      title: "PRACTICUM",
      creditHours: "1-3",
    });
  });

  it("returns null credit hours when no parenthetical is present", () => {
    expect(parseCreditHours("SPECIAL TOPICS")).toEqual({
      title: "SPECIAL TOPICS",
      creditHours: null,
    });
  });
});
