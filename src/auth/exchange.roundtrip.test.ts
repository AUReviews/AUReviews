/**
 * Drift guard for the code exchange (issue #47, ADR 0003).
 *
 * `exchange.ts` reproduces two Auth.js internals — the verification-token hash
 * and the session-cookie contract. This test pins both against the REAL
 * library, end to end:
 *   1. mint a code through the real `signIn("resend")` path (Auth.js hashes and
 *      stores the token via our adapter; the mailer is mocked to capture the
 *      code the user would receive),
 *   2. exchange it through OUR `exchangeCodeForSession` (which must compute
 *      the same hash to find the token, then set the cookie),
 *   3. read the session back through the REAL Auth.js session route using
 *      only that cookie — the same route `useSession` in the header polls.
 * If Auth.js changes its token hashing or cookie naming, step 2 or 3 fails
 * here, loudly, instead of every sign-in silently breaking in production.
 *
 * The adapter is swapped for an in-memory one: the adapter's own semantics
 * (hash-only rows, single use, attempt cap) are pinned by adapter.test.ts; what
 * this test cares about is the contract BETWEEN Auth.js and exchange.ts.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Adapter,
  AdapterSession,
  AdapterUser,
  VerificationToken,
} from "next-auth/adapters";

const EMAIL = "abc1234@auburn.edu";

// ---- Fake request context (next/headers) -----------------------------------
// next-auth's server-side `signIn` and our exchange both read `headers()` and
// write `cookies()`; outside a Next request those don't exist, so provide an
// in-memory jar and a plain-http localhost request.
const cookieJar = new Map<
  string,
  { value: string; options: Record<string, unknown> | undefined }
>();
const requestHeaders = new Headers({
  host: "localhost:3000",
  "x-forwarded-proto": "http",
  "x-forwarded-host": "localhost:3000",
});
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders,
  cookies: async () => ({
    get: (name: string) => {
      const entry = cookieJar.get(name);
      return entry ? { name, value: entry.value } : undefined;
    },
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      cookieJar.set(name, { value, options });
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
}));

// ---- Mailer: capture the code instead of sending -----------------------------
const sentCodes: string[] = [];
vi.mock("./mailer", () => ({
  fromAddress: () => "AUReviews <test@example.test>",
  sendSignInCodeEmail: async ({ code }: { code: string }) => {
    sentCodes.push(code);
  },
}));

// ---- In-memory adapter -----------------------------------------------------
const tokens: VerificationToken[] = [];
const users = new Map<string, AdapterUser>(); // keyed by email
const sessions = new Map<string, AdapterSession>();

const memoryAdapter: Adapter = {
  async createVerificationToken(token) {
    tokens.push(token);
    return token;
  },
  async useVerificationToken({ identifier, token }) {
    const i = tokens.findIndex((t) => t.identifier === identifier && t.token === token);
    if (i === -1) return null;
    return tokens.splice(i, 1)[0];
  },
  async getUserByEmail(email) {
    return users.get(email) ?? null;
  },
  async createUser(user) {
    const created = { ...user, id: `identity-${users.size + 1}` };
    users.set(user.email, created);
    return created;
  },
  async getUser(id) {
    return [...users.values()].find((u) => u.id === id) ?? null;
  },
  async getUserByAccount() {
    return null;
  },
  async updateUser(user) {
    return [...users.values()].find((u) => u.id === user.id)!;
  },
  async linkAccount() {
    return undefined;
  },
  async createSession(session) {
    sessions.set(session.sessionToken, session);
    return session;
  },
  async getSessionAndUser(sessionToken) {
    const session = sessions.get(sessionToken);
    if (!session) return null;
    const user = [...users.values()].find((u) => u.id === session.userId);
    if (!user) return null;
    // Mirror the real adapter: the user handed to Auth.js carries no address.
    return { session, user: { ...user, email: "" } };
  },
  async updateSession(session) {
    const existing = sessions.get(session.sessionToken);
    if (!existing) return null;
    const updated = { ...existing, ...session };
    sessions.set(session.sessionToken, updated);
    return updated;
  },
  async deleteSession(sessionToken) {
    sessions.delete(sessionToken);
  },
};
vi.mock("./adapter", () => ({ createHashingAdapter: () => memoryAdapter }));

// Env BEFORE the auth module loads: next-auth reads AUTH_SECRET at setup.
process.env.AUTH_SECRET = "roundtrip-test-auth-secret";
process.env.PEPPER = "roundtrip-test-pepper";
delete process.env.AUTH_URL;
delete process.env.NEXTAUTH_URL;
delete process.env.RESEND_API_KEY;

const { signIn, handlers } = await import("./index");
const { exchangeCodeForSession } = await import("./exchange");

async function readSessionViaAuthJs(cookieHeader: string) {
  const res = await handlers.GET(
    new NextRequest("http://localhost:3000/api/auth/session", {
      headers: { cookie: cookieHeader },
    }),
  );
  return { status: res.status, body: (await res.json()) as unknown };
}

describe("exchange ↔ Auth.js round trip", () => {
  beforeEach(() => {
    cookieJar.clear();
    sentCodes.length = 0;
    tokens.length = 0;
    users.clear();
    sessions.clear();
  });

  it("a code minted by the real signIn('resend') is exchangeable, and the cookie we set is a session Auth.js recognizes", async () => {
    // 1. Mint through Auth.js (the same call requestSignInCode makes).
    const sendResult = await signIn("resend", { email: EMAIL, redirect: false });
    expect(String(sendResult)).not.toContain("error=");
    expect(sentCodes).toHaveLength(1);
    const code = sentCodes[0];
    expect(code).toMatch(/^\d{6}$/);
    // Auth.js stored a HASH, not the code (adapter contract, but worth seeing).
    expect(tokens).toHaveLength(1);
    expect(tokens[0].token).not.toBe(code);

    // 2. Exchange through our module: it must compute the identical hash.
    const result = await exchangeCodeForSession({ email: EMAIL, code });
    expect(result.ok).toBe(true);
    expect(tokens).toHaveLength(0); // consumed
    expect(sessions.size).toBe(1);

    // 3. The cookie we set: unprefixed on plain http, Auth.js's attributes.
    const cookie = cookieJar.get("authjs.session-token");
    expect(cookie).toBeDefined();
    expect(cookie!.options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: false,
    });
    const [session] = sessions.values();
    expect(cookie!.value).toBe(session.sessionToken);

    // 4. Auth.js's own session route accepts it — the header's useSession would
    //    flip to "authenticated" — and exposes nothing identifying.
    const { status, body } = await readSessionViaAuthJs(
      `authjs.session-token=${cookie!.value}`,
    );
    expect(status).toBe(200);
    expect(body).toMatchObject({ user: { email: "", name: null, image: null, id: "" } });
    expect(JSON.stringify(body)).not.toContain("abc1234");
  });

  it("the same code cannot be exchanged twice", async () => {
    await signIn("resend", { email: EMAIL, redirect: false });
    const code = sentCodes[0];
    expect((await exchangeCodeForSession({ email: EMAIL, code })).ok).toBe(true);
    expect(await exchangeCodeForSession({ email: EMAIL, code })).toEqual({
      ok: false,
      reason: "Verification",
    });
  });

  it("a wrong code fails generically and Auth.js sees no session", async () => {
    await signIn("resend", { email: EMAIL, redirect: false });
    const wrong = sentCodes[0] === "000000" ? "000001" : "000000";
    expect(await exchangeCodeForSession({ email: EMAIL, code: wrong })).toEqual({
      ok: false,
      reason: "Verification",
    });
    expect(cookieJar.get("authjs.session-token")).toBeUndefined();
    const { body } = await readSessionViaAuthJs("authjs.session-token=nope");
    expect(body).toBeNull();
  });
});
