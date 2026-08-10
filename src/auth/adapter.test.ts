import { beforeEach, describe, expect, it, vi } from "vitest";

// Spy DB: records what `.values()` is asked to insert so we can assert the
// adapter persists the hash and never the plaintext email. Mimics only the
// drizzle chain the adapter actually uses.
const inserted: unknown[] = [];

// Configurable result for the select chain (getUser / getUserByEmail).
let selectResult: unknown[] = [];

const fakeDb = {
  insert: () => ({
    values: (v: unknown) => {
      inserted.push(v);
      return {
        onConflictDoUpdate: () => ({
          returning: () =>
            Promise.resolve([{ id: "user-1", verifiedAt: new Date() }]),
        }),
      };
    },
  }),
  select: () => ({
    from: () => ({
      where: () => ({ limit: () => Promise.resolve(selectResult) }),
    }),
  }),
};

vi.mock("@/db/client", () => ({ getDb: () => fakeDb }));

// Import AFTER the mock is registered.
const { createHashingAdapter } = await import("./adapter");
const { computeIdentityHash } = await import("@/domain");

const PEPPER = "test-pepper-for-adapter";

describe("hashing adapter — createUser", () => {
  beforeEach(() => {
    inserted.length = 0;
    process.env.PEPPER = PEPPER;
  });

  it("persists the identity_hash, never the email", async () => {
    const email = "abc1234@auburn.edu";
    const adapter = createHashingAdapter();

    await adapter.createUser!({ id: "", email, emailVerified: null });

    expect(inserted).toHaveLength(1);
    const values = inserted[0] as { identityHash: string };
    expect(values.identityHash).toBe(computeIdentityHash(PEPPER, email));

    // The crux of the anonymity architecture: the address must appear nowhere in
    // what we write to the database.
    expect(JSON.stringify(inserted)).not.toContain("abc1234");
    expect(JSON.stringify(inserted)).not.toContain("auburn.edu");
  });

  it("hashes case/whitespace variants of an address identically", async () => {
    const adapter = createHashingAdapter();
    await adapter.createUser!({ id: "", email: "ABC1234@Auburn.EDU ", emailVerified: null });
    const values = inserted[0] as { identityHash: string };
    expect(values.identityHash).toBe(
      computeIdentityHash(PEPPER, "abc1234@auburn.edu"),
    );
  });

  it("refuses to hash when the pepper is missing", async () => {
    delete process.env.PEPPER;
    const adapter = createHashingAdapter();
    await expect(
      adapter.createUser!({ id: "", email: "abc1234@auburn.edu", emailVerified: null }),
    ).rejects.toThrow(/PEPPER/);
  });
});

describe("hashing adapter — reads", () => {
  beforeEach(() => {
    process.env.PEPPER = PEPPER;
    selectResult = [{ id: "user-1", verifiedAt: new Date() }];
  });

  it("getUserByEmail echoes the address so the signIn domain re-check passes for returning users", async () => {
    // Regression: a returning user requesting a fresh link must not be rejected
    // with AccessDenied. Auth.js runs the domain check against the returned
    // user's email, so getUserByEmail must surface the queried address.
    const adapter = createHashingAdapter();
    const user = await adapter.getUserByEmail!("abc1234@auburn.edu");
    expect(user?.id).toBe("user-1");
    expect(user?.email).toBe("abc1234@auburn.edu");
  });

  it("getUserByEmail returns null when no identity matches", async () => {
    selectResult = [];
    const adapter = createHashingAdapter();
    expect(await adapter.getUserByEmail!("nobody@auburn.edu")).toBeNull();
  });

  it("getUser stays blanked — no address is available or exposed by id lookup", async () => {
    const adapter = createHashingAdapter();
    const user = await adapter.getUser!("user-1");
    expect(user?.id).toBe("user-1");
    expect(user?.email).toBe("");
  });
});
