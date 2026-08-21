import { describe, expect, it } from "vitest";
import { siteOrigin } from "./site-origin";

describe("siteOrigin", () => {
  it("uses the forwarded host first, so previews and local runs link to themselves", () => {
    expect(
      siteOrigin(
        { host: "preview.vercel.app", proto: "https" },
        { AUREVIEWS_BASE_URL: "https://aureviews.com" },
      ),
    ).toBe("https://preview.vercel.app");
    expect(siteOrigin({ host: "localhost:3000", proto: null }, {})).toBe("http://localhost:3000");
  });

  it("falls back to the configured origin, trailing slash stripped", () => {
    expect(siteOrigin({ host: null, proto: null }, { AUREVIEWS_BASE_URL: "https://aureviews.com/" })).toBe(
      "https://aureviews.com",
    );
    expect(siteOrigin({ host: null, proto: null }, { AUTH_URL: "https://a.example" })).toBe(
      "https://a.example",
    );
  });

  it("has a last-resort default", () => {
    expect(siteOrigin({ host: null, proto: null }, {})).toBe("https://aureviews.com");
  });
});
