import { describe, expect, it } from "vitest";
import { formatPlaceholder } from "./placeholder";

describe("formatPlaceholder", () => {
  it("renders the message with an ISO-stamped seed time", () => {
    const line = formatPlaceholder({
      id: 1,
      message: "hello from Postgres",
      createdAt: new Date("2026-08-09T12:00:00.000Z"),
    });
    expect(line).toBe("hello from Postgres (seeded 2026-08-09T12:00:00.000Z)");
  });
});
