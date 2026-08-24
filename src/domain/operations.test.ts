import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPERATOR_FLAGS,
  initialReviewStatus,
  normalizeOperatorFlags,
} from "./operations";

describe("normalizeOperatorFlags", () => {
  it("defaults to open/writable when nothing is configured", () => {
    expect(normalizeOperatorFlags(undefined)).toEqual(DEFAULT_OPERATOR_FLAGS);
    expect(normalizeOperatorFlags(null)).toEqual(DEFAULT_OPERATOR_FLAGS);
    expect(normalizeOperatorFlags({})).toEqual({
      moderationMode: "open",
      readOnly: false,
    });
  });

  it("passes through the two real flag values", () => {
    expect(
      normalizeOperatorFlags({ moderationMode: "queue", readOnly: true }),
    ).toEqual({ moderationMode: "queue", readOnly: true });
    expect(
      normalizeOperatorFlags({ moderationMode: "open", readOnly: false }),
    ).toEqual({ moderationMode: "open", readOnly: false });
  });

  it("fails open on unrecognized values instead of guessing", () => {
    expect(
      normalizeOperatorFlags({ moderationMode: "closed", readOnly: "true" }),
    ).toEqual(DEFAULT_OPERATOR_FLAGS);
    expect(
      normalizeOperatorFlags({ moderationMode: 1, readOnly: 1 }),
    ).toEqual(DEFAULT_OPERATOR_FLAGS);
    expect(
      normalizeOperatorFlags({ moderationMode: "QUEUE", readOnly: "yes" }),
    ).toEqual(DEFAULT_OPERATOR_FLAGS);
  });

  it("normalizes each flag independently", () => {
    expect(
      normalizeOperatorFlags({ moderationMode: "queue", readOnly: "junk" }),
    ).toEqual({ moderationMode: "queue", readOnly: false });
    expect(normalizeOperatorFlags({ readOnly: true })).toEqual({
      moderationMode: "open",
      readOnly: true,
    });
  });
});

describe("initialReviewStatus", () => {
  it("publishes on submit in open mode", () => {
    expect(
      initialReviewStatus({ moderationMode: "open", readOnly: false }),
    ).toBe("published");
  });

  it("queues new submissions as pending behind the panic switch", () => {
    expect(
      initialReviewStatus({ moderationMode: "queue", readOnly: false }),
    ).toBe("pending");
  });
});
