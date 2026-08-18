import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Adapter } from "next-auth/adapters";
import {
  SESSION_MAX_AGE_SECONDS,
  exchangeCode,
  hashVerificationToken,
  sessionCookie,
  secureCookiesFor,
} from "./exchange";
import { computeIdentityHash } from "@/domain";

const PEPPER = "test-pepper-for-exchange";
const SECRET = "test-auth-secret";
const EMAIL = "abc1234@auburn.edu";
const CODE = "123456";
const NOW = new Date("2026-08-17T12:00:00Z");

// A recording fake of the ONLY adapter methods the exchange may touch. Every
// method is a spy so tests can assert both what was called and what was not.
function fakeAdapter(overrides: Partial<Adapter> = {}) {
  const adapter = {
    useVerificationToken: vi.fn(async ({ identifier, token }) => ({
      identifier,
      token,
      expires: new Date(NOW.getTime() + 60_000),
    })),
    getUserByEmail: vi.fn(async () => null),
    createUser: vi.fn(async (user) => ({ ...user, id: "identity-1", email: "" })),
    createSession: vi.fn(async (session) => session),
    ...overrides,
  } satisfies Partial<Adapter>;
  return adapter as typeof adapter & Adapter;
}

function deps(adapter: Adapter) {
  return {
    adapter,
    secret: SECRET,
    now: () => NOW,
    generateSessionToken: () => "session-token-1",
  };
}

beforeEach(() => {
  process.env.PEPPER = PEPPER;
});

describe("hashVerificationToken", () => {
  it("matches Auth.js: sha256(token + secret) as lowercase hex", () => {
    const expected = createHash("sha256").update(`${CODE}${SECRET}`).digest("hex");
    expect(hashVerificationToken(CODE, SECRET)).toBe(expected);
  });
});

describe("exchangeCode — happy path", () => {
  it("consumes the code via the adapter, mints a session, and resolves the identity hash", async () => {
    const adapter = fakeAdapter();
    const result = await exchangeCode({ email: EMAIL, code: CODE }, deps(adapter));

    expect(result).toEqual({
      ok: true,
      identityHash: computeIdentityHash(PEPPER, EMAIL),
      session: {
        sessionToken: "session-token-1",
        expires: new Date(NOW.getTime() + SESSION_MAX_AGE_SECONDS * 1000),
      },
    });
    // The adapter stays the sole owner of single-use / attempt-cap semantics:
    // we hand it the raw address and Auth.js's own hash of the code.
    expect(adapter.useVerificationToken).toHaveBeenCalledWith({
      identifier: EMAIL,
      token: hashVerificationToken(CODE, SECRET),
    });
    expect(adapter.createUser).toHaveBeenCalledTimes(1);
    expect(adapter.createSession).toHaveBeenCalledWith({
      sessionToken: "session-token-1",
      userId: "identity-1",
      expires: new Date(NOW.getTime() + SESSION_MAX_AGE_SECONDS * 1000),
    });
  });

  it("uses Auth.js's default 30-day session life", () => {
    expect(SESSION_MAX_AGE_SECONDS).toBe(30 * 24 * 60 * 60);
  });

  it("reuses an existing identity instead of creating one", async () => {
    const adapter = fakeAdapter({
      getUserByEmail: vi.fn(async (email) => ({
        id: "identity-existing",
        email,
        emailVerified: NOW,
      })),
    });
    const result = await exchangeCode({ email: EMAIL, code: CODE }, deps(adapter));
    expect(result.ok).toBe(true);
    expect(adapter.createUser).not.toHaveBeenCalled();
    expect(adapter.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "identity-existing" }),
    );
  });

  it("normalizes the address before it reaches the adapter or the hash", async () => {
    const adapter = fakeAdapter();
    const result = await exchangeCode(
      { email: "  ABC1234@Auburn.EDU ", code: "123 456" },
      deps(adapter),
    );
    expect(result).toMatchObject({
      ok: true,
      identityHash: computeIdentityHash(PEPPER, EMAIL),
    });
    expect(adapter.useVerificationToken).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: EMAIL }),
    );
    // Digits only: the grouped display form "123 456" is the same code.
    expect(adapter.useVerificationToken).toHaveBeenCalledWith(
      expect.objectContaining({ token: hashVerificationToken(CODE, SECRET) }),
    );
  });
});

describe("exchangeCode — rejections", () => {
  it("returns the generic Verification failure for a wrong code and mints nothing", async () => {
    const adapter = fakeAdapter({ useVerificationToken: vi.fn(async () => null) });
    const result = await exchangeCode({ email: EMAIL, code: CODE }, deps(adapter));
    expect(result).toEqual({ ok: false, reason: "Verification" });
    expect(adapter.createUser).not.toHaveBeenCalled();
    expect(adapter.createSession).not.toHaveBeenCalled();
  });

  it("treats an expired token as the same generic failure", async () => {
    const adapter = fakeAdapter({
      useVerificationToken: vi.fn(async ({ identifier, token }) => ({
        identifier,
        token,
        expires: new Date(NOW.getTime() - 1),
      })),
    });
    const result = await exchangeCode({ email: EMAIL, code: CODE }, deps(adapter));
    expect(result).toEqual({ ok: false, reason: "Verification" });
    expect(adapter.createSession).not.toHaveBeenCalled();
  });

  it("rejects a non-Auburn address before touching the adapter", async () => {
    const adapter = fakeAdapter();
    const result = await exchangeCode(
      { email: "someone@gmail.com", code: CODE },
      deps(adapter),
    );
    expect(result).toEqual({ ok: false, reason: "domain" });
    expect(adapter.useVerificationToken).not.toHaveBeenCalled();
  });

  it("rejects a malformed code without spending a guess", async () => {
    const adapter = fakeAdapter();
    for (const code of ["", "12345", "1234567", "abcdef"]) {
      const result = await exchangeCode({ email: EMAIL, code }, deps(adapter));
      expect(result).toEqual({ ok: false, reason: "Verification" });
    }
    expect(adapter.useVerificationToken).not.toHaveBeenCalled();
  });
});

describe("sessionCookie — Auth.js's database-session cookie contract", () => {
  const expires = new Date(NOW.getTime() + 1000);

  it("is the unprefixed name with lax/httpOnly/path=/ over http", () => {
    expect(sessionCookie("tok", expires, false)).toEqual({
      name: "authjs.session-token",
      value: "tok",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: false, expires },
    });
  });

  it("is the __Secure- prefixed, secure cookie over https", () => {
    expect(sessionCookie("tok", expires, true)).toEqual({
      name: "__Secure-authjs.session-token",
      value: "tok",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: true, expires },
    });
  });
});

describe("secureCookiesFor — mirrors how Auth.js picks the cookie prefix", () => {
  it("follows AUTH_URL's protocol when set", () => {
    expect(secureCookiesFor(new Headers(), { AUTH_URL: "https://aureviews.com" })).toBe(true);
    expect(secureCookiesFor(new Headers(), { AUTH_URL: "http://localhost:3000" })).toBe(false);
    expect(secureCookiesFor(new Headers(), { NEXTAUTH_URL: "https://x.test" })).toBe(true);
  });

  it("otherwise follows x-forwarded-proto, defaulting to https", () => {
    expect(secureCookiesFor(new Headers({ "x-forwarded-proto": "http" }), {})).toBe(false);
    expect(secureCookiesFor(new Headers({ "x-forwarded-proto": "https" }), {})).toBe(true);
    expect(secureCookiesFor(new Headers(), {})).toBe(true);
  });
});
