import { describe, expect, it } from "vitest";
import {
  BODY_MIN_LENGTH,
  GRADE_OPTIONS,
  LANGUAGE_OPTIONS,
  type ReviewCoreInput,
  canSubmitReview,
  checkReviewBody,
  parseInstructorChoice,
  sanitizeMultiSelect,
  sanitizeSingleSelect,
  selectableTerms,
  validateReviewCore,
} from "./review";

// A clean body comfortably over the 100-char floor, reused across cases.
const CLEAN_BODY =
  "The workload was steady all semester and the problem sets genuinely helped me learn the material well.";

function coreInput(over: Partial<ReviewCoreInput> = {}): ReviewCoreInput {
  return {
    overall: 4,
    difficulty: 3,
    workloadHours: 10,
    termCode: "202620",
    instructor: { kind: "instructor", id: "abc" },
    body: CLEAN_BODY,
    ...over,
  };
}

describe("selectableTerms — rolling window (§4)", () => {
  // 2026-08-15 is squarely in Fall 2026 (month index 7).
  const fall2026 = new Date("2026-08-15T12:00:00Z");

  it("launch mode offers 12 terms, newest first, starting at the current term", () => {
    const terms = selectableTerms(fall2026, "launch");
    expect(terms).toHaveLength(12);
    expect(terms[0]).toMatchObject({
      semester: "Fall",
      year: 2026,
      code: "202710",
      label: "Fall 2026",
    });
    // Walk-back crosses the year boundary: the term before Fall is Summer, then
    // Spring of the same calendar year.
    expect(terms[1]).toMatchObject({ semester: "Summer", year: 2026, code: "202630" });
    expect(terms[2]).toMatchObject({ semester: "Spring", year: 2026, code: "202620" });
    // The 12th term (index 11) counting back from Fall 2026 is Spring 2023.
    expect(terms[11]).toMatchObject({ semester: "Spring", year: 2023, code: "202320" });
  });

  it("steady mode offers only the last 3 semesters", () => {
    const terms = selectableTerms(fall2026, "steady");
    expect(terms.map((t) => t.code)).toEqual(["202710", "202630", "202620"]);
  });

  it("anchors on the term in progress for spring and summer dates", () => {
    expect(selectableTerms(new Date("2026-02-01T12:00:00Z"), "steady")[0]).toMatchObject({
      semester: "Spring",
      year: 2026,
    });
    expect(selectableTerms(new Date("2026-06-01T12:00:00Z"), "steady")[0]).toMatchObject({
      semester: "Summer",
      year: 2026,
    });
  });
});

describe("checkReviewBody — the door (§11.A)", () => {
  it("passes a clean, long-enough body", () => {
    expect(checkReviewBody(CLEAN_BODY)).toEqual([]);
  });

  it("blocks a body under the 100-char minimum, counting trimmed length", () => {
    const short = "  too short  ";
    const blocks = checkReviewBody(short);
    expect(blocks.map((b) => b.code)).toContain("too-short");
    // Padding whitespace can't pad past the floor.
    expect(checkReviewBody(" ".repeat(BODY_MIN_LENGTH) + "x").map((b) => b.code)).toContain(
      "too-short",
    );
  });

  it("blocks links: schemes, www, and bare domains with a known TLD", () => {
    expect(checkReviewBody(CLEAN_BODY + " see https://x.com/y").map((b) => b.code)).toContain(
      "contains-url",
    );
    expect(checkReviewBody(CLEAN_BODY + " www.foo.org").map((b) => b.code)).toContain(
      "contains-url",
    );
    expect(checkReviewBody(CLEAN_BODY + " visit google.com now").map((b) => b.code)).toContain(
      "contains-url",
    );
  });

  it("does not treat ordinary prose punctuation as a link", () => {
    const prose =
      "It was hard, e.g. the proofs, but the average was about 3.5 and the U.S. examples helped a lot here.";
    expect(checkReviewBody(prose).map((b) => b.code)).not.toContain("contains-url");
  });

  it("blocks contact info: emails and phone numbers", () => {
    expect(checkReviewBody(CLEAN_BODY + " email me at a@b.com").map((b) => b.code)).toContain(
      "contains-contact",
    );
    expect(checkReviewBody(CLEAN_BODY + " call (334) 555-1234").map((b) => b.code)).toContain(
      "contains-contact",
    );
  });

  it("does not treat a workload range as a phone number", () => {
    expect(checkReviewBody(CLEAN_BODY + " about 10-15 hours").map((b) => b.code)).not.toContain(
      "contains-contact",
    );
  });

  it("does not flag a 10-digit run buried inside a longer number", () => {
    // A 16-digit id contains a 10-digit substring; the phone rule must not fire
    // on it (it is boundary-pinned to a standalone number).
    expect(checkReviewBody(CLEAN_BODY + " ref 1234567890123456").map((b) => b.code)).not.toContain(
      "contains-contact",
    );
  });

  it("blocks a slur/protected-characteristic term on a word boundary", () => {
    const withSlur =
      "Honestly the professor is a retard and the whole thing was a waste of my entire semester here.";
    expect(checkReviewBody(withSlur).map((b) => b.code)).toContain("blocklisted-term");
    // But a benign superstring must not trip it (Scunthorpe problem).
    const benign =
      "The scattering of topics near the end felt rushed but overall it was a genuinely solid course.";
    expect(checkReviewBody(benign).map((b) => b.code)).not.toContain("blocklisted-term");
  });
});

describe("parseInstructorChoice — required with escapes (§4)", () => {
  it("resolves the two unknown escapes and a real id", () => {
    expect(parseInstructorChoice("not-listed")).toEqual({ kind: "not-listed" });
    expect(parseInstructorChoice("dont-remember")).toEqual({ kind: "dont-remember" });
    expect(parseInstructorChoice("uuid-123")).toEqual({ kind: "instructor", id: "uuid-123" });
  });

  it("treats the empty placeholder as no choice", () => {
    expect(parseInstructorChoice("")).toBeNull();
    expect(parseInstructorChoice(null)).toBeNull();
  });
});

describe("validateReviewCore — the full submit gate (§4/§11)", () => {
  const opts = { selectableTermCodes: ["202710", "202630", "202620"] };

  it("accepts a complete, clean submission", () => {
    expect(validateReviewCore(coreInput(), opts)).toEqual([]);
    expect(canSubmitReview(coreInput(), opts)).toBe(true);
  });

  it("rejects out-of-range required numbers", () => {
    const errs = validateReviewCore(
      coreInput({ overall: 6, difficulty: 0, workloadHours: 41 }),
      opts,
    );
    expect(errs.map((e) => e.field)).toEqual(
      expect.arrayContaining(["overall", "difficulty", "workloadHours"]),
    );
  });

  it("rejects a non-integer workload (free-entry field, not a slider)", () => {
    const errs = validateReviewCore(coreInput({ workloadHours: 12.5 }), opts);
    expect(errs.map((e) => e.field)).toContain("workloadHours");
  });

  it("rejects a term outside the rolling window", () => {
    const errs = validateReviewCore(coreInput({ termCode: "201010" }), opts);
    expect(errs.map((e) => e.field)).toContain("termCode");
  });

  it("requires an instructor choice", () => {
    const errs = validateReviewCore(coreInput({ instructor: null }), opts);
    expect(errs.map((e) => e.field)).toContain("instructor");
  });

  it("accepts the instructor unknown escapes as valid", () => {
    expect(canSubmitReview(coreInput({ instructor: { kind: "not-listed" } }), opts)).toBe(true);
    expect(canSubmitReview(coreInput({ instructor: { kind: "dont-remember" } }), opts)).toBe(true);
  });

  it("surfaces body door-blocks as body-field errors", () => {
    const errs = validateReviewCore(coreInput({ body: "too short" }), opts);
    expect(errs.some((e) => e.field === "body")).toBe(true);
  });
});

describe("optional-detail sanitizers (§4 — never block, drop junk)", () => {
  it("keeps only allowed multi-select values, deduped and ordered", () => {
    expect(
      sanitizeMultiSelect(["Java", "made-up", "Python", "Java"], LANGUAGE_OPTIONS),
    ).toEqual(["Java", "Python"]);
    expect(sanitizeMultiSelect([], LANGUAGE_OPTIONS)).toEqual([]);
  });

  it("keeps an allowed single-select and nulls anything else", () => {
    expect(sanitizeSingleSelect("A", GRADE_OPTIONS)).toBe("A");
    expect(sanitizeSingleSelect("Z", GRADE_OPTIONS)).toBeNull();
    expect(sanitizeSingleSelect(null, GRADE_OPTIONS)).toBeNull();
    expect(sanitizeSingleSelect(undefined, GRADE_OPTIONS)).toBeNull();
  });
});
