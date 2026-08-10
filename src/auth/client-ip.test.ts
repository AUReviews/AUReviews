import { describe, expect, it } from "vitest";
import { clientIpFromHeaders } from "./client-ip";

function headers(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe("clientIpFromHeaders", () => {
  it("takes the first hop of x-forwarded-for", () => {
    expect(
      clientIpFromHeaders(headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })),
    ).toBe("203.0.113.7");
  });

  it("trims whitespace around the client hop", () => {
    expect(
      clientIpFromHeaders(headers({ "x-forwarded-for": "  203.0.113.7 , 10.0.0.1" })),
    ).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip when no forwarded-for", () => {
    expect(clientIpFromHeaders(headers({ "x-real-ip": "198.51.100.9" }))).toBe(
      "198.51.100.9",
    );
  });

  it("returns a stable 'unknown' sentinel when no IP header is present", () => {
    expect(clientIpFromHeaders(headers({}))).toBe("unknown");
  });
});
