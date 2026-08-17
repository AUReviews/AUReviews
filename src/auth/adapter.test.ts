import { beforeEach, describe, expect, it, vi } from "vitest";

// Spy DB: records what each drizzle chain is asked to do so we can assert the
// adapter persists hashes and never the plaintext email. Mimics only the
// chains the adapter actually uses; result queues are configured per test.
const inserted: unknown[] = [];

// Configurable result for the select chain (getUser / getUserByEmail).
let selectResult: unknown[] = [];

// Queued results for `.returning()` on delete/update chains, plus call counts
// so tests can assert how many destructive statements ran.
let deleteReturning: unknown[][] = [];
let updateReturning: unknown[][] = [];
let deleteCalls = 0;
let updateCalls = 0;

type Resolve = ((v: unknown) => unknown) | undefined | null;

const fakeDb = {
  insert: () => ({
    values: (v: unknown) => {
      inserted.push(v);
      return {
        onConflictDoUpdate: () => ({
          returning: () =>
            Promise.resolve([{ id: "user-1", verifiedAt: new Date() }]),
        }),
        returning: () => Promise.resolve([v]),
        // Awaitable without `.returning()` (verification-token insert).
        then: (resolve: Resolve, reject: Resolve) =>
          Promise.resolve(undefined).then(resolve, reject),
      };
    },
  }),
  select: () => ({
    from: () => ({
      where: () => ({ limit: () => Promise.resolve(selectResult) }),
    }),
  }),
  delete: () => ({
    where: () => {
      deleteCalls += 1;
      return {
        returning: () => Promise.resolve(deleteReturning.shift() ?? []),
        // Awaitable without `.returning()` (prior-token drop, invalidation).
        then: (resolve: Resolve, reject: Resolve) =>
          Promise.resolve(undefined).then(resolve, reject),
      };
    },
  }),
  update: () => ({
    set: () => ({
      where: () => {
        updateCalls += 1;
        return {
          returning: () => Promise.resolve(updateReturning.shift() ?? []),
        };
      },
    }),
  }),
};

vi.mock("@/db/client", () => ({ getDb: () => fakeDb }));

// Import AFTER the mock is registered.
const { createHashingAdapter, MAX_CODE_ATTEMPTS } = await import("./adapter");
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

describe("hashing adapter — verification codes", () => {
  const email = "abc1234@auburn.edu";
  const hashedIdentifier = computeIdentityHash(PEPPER, email);

  beforeEach(() => {
    inserted.length = 0;
    selectResult = [];
    deleteReturning = [];
    updateReturning = [];
    deleteCalls = 0;
    updateCalls = 0;
    process.env.PEPPER = PEPPER;
  });

  it("createVerificationToken stores the peppered identifier hash, never the address", async () => {
    const adapter = createHashingAdapter();
    const expires = new Date(Date.now() + 600_000);
    const input = { identifier: email, token: "secret-hashed-code", expires };

    const result = await adapter.createVerificationToken!(input);

    expect(result).toEqual(input);
    // Prior token for the address is dropped first — one live code per address.
    expect(deleteCalls).toBe(1);
    expect(inserted).toHaveLength(1);
    const values = inserted[0] as { identifier: string };
    expect(values.identifier).toBe(hashedIdentifier);
    expect(JSON.stringify(inserted)).not.toContain("abc1234");
    expect(JSON.stringify(inserted)).not.toContain("auburn.edu");
  });

  it("hashes form-typed identifier variants identically", async () => {
    const adapter = createHashingAdapter();
    await adapter.createVerificationToken!({
      identifier: " ABC1234@Auburn.EDU ",
      token: "t",
      expires: new Date(),
    });
    const values = inserted[0] as { identifier: string };
    expect(values.identifier).toBe(hashedIdentifier);
  });

  it("returns the row on a correct code, echoing the caller's raw identifier", async () => {
    const expires = new Date(Date.now() + 600_000);
    deleteReturning = [
      [{ identifier: hashedIdentifier, token: "secret-hashed-code", expires, attempts: 0 }],
    ];
    const adapter = createHashingAdapter();

    const result = await adapter.useVerificationToken!({
      identifier: email,
      token: "secret-hashed-code",
    });

    // Auth.js compares the returned identifier against the email param and then
    // builds the user from it — it must be the raw address, not our hash.
    expect(result).toEqual({ identifier: email, token: "secret-hashed-code", expires });
    expect(updateCalls).toBe(0);
  });

  it("counts a wrong code and keeps the token while under the cap", async () => {
    deleteReturning = [[]];
    updateReturning = [[{ attempts: 1 }]];
    const adapter = createHashingAdapter();

    const result = await adapter.useVerificationToken!({ identifier: email, token: "wrong" });

    expect(result).toBeNull();
    expect(updateCalls).toBe(1);
    // Only the failed single-use claim — no invalidation delete.
    expect(deleteCalls).toBe(1);
  });

  it(`invalidates the token on wrong guess #${MAX_CODE_ATTEMPTS}`, async () => {
    deleteReturning = [[]];
    updateReturning = [[{ attempts: MAX_CODE_ATTEMPTS }]];
    const adapter = createHashingAdapter();

    const result = await adapter.useVerificationToken!({ identifier: email, token: "wrong" });

    expect(result).toBeNull();
    // Failed claim + the invalidation delete.
    expect(deleteCalls).toBe(2);
  });

  it("stays null with no live token and touches nothing else", async () => {
    deleteReturning = [[]];
    updateReturning = [[]];
    const adapter = createHashingAdapter();

    const result = await adapter.useVerificationToken!({ identifier: email, token: "wrong" });

    expect(result).toBeNull();
    expect(deleteCalls).toBe(1);
  });

  it("refuses to operate without the pepper", async () => {
    delete process.env.PEPPER;
    const adapter = createHashingAdapter();
    await expect(
      adapter.useVerificationToken!({ identifier: email, token: "x" }),
    ).rejects.toThrow(/PEPPER/);
  });
});
