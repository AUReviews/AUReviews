import { describe, expect, it } from "vitest";
import { parseRevalidateRequest } from "./revalidate";

const SECRET = "s3cret";
const auth = `Bearer ${SECRET}`;

describe("parseRevalidateRequest", () => {
  it("rejects when the server has no secret configured", () => {
    const plan = parseRevalidateRequest(auth, { tag: "placeholder" }, undefined);
    expect(plan).toMatchObject({ ok: false, status: 401 });
  });

  it("rejects a missing or wrong bearer token", () => {
    expect(parseRevalidateRequest(null, { tag: "x" }, SECRET)).toMatchObject({
      ok: false,
      status: 401,
    });
    expect(
      parseRevalidateRequest("Bearer nope", { tag: "x" }, SECRET),
    ).toMatchObject({ ok: false, status: 401 });
  });

  it("plans a tag revalidation for an authorized request", () => {
    const plan = parseRevalidateRequest(auth, { tag: "placeholder" }, SECRET);
    expect(plan).toEqual({ ok: true, status: 200, tags: ["placeholder"], paths: [] });
  });

  it("plans a path revalidation", () => {
    const plan = parseRevalidateRequest(auth, { path: "/" }, SECRET);
    expect(plan).toEqual({ ok: true, status: 200, tags: [], paths: ["/"] });
  });

  it("rejects a non-empty body with no tag or path", () => {
    expect(parseRevalidateRequest(auth, {}, SECRET)).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it("rejects a malformed path", () => {
    expect(
      parseRevalidateRequest(auth, { path: "no-leading-slash" }, SECRET),
    ).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects an empty tag string", () => {
    expect(parseRevalidateRequest(auth, { tag: "" }, SECRET)).toMatchObject({
      ok: false,
      status: 400,
    });
  });
});
