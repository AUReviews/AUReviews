import { beforeEach, describe, expect, it, vi } from "vitest";

// Spy DB: records what `.values()` is asked to insert so we can assert the
// adapter persists the hash and never the plaintext email. Mimics only the
// drizzle chain the adapter actually uses.
const inserted: unknown[] = [];

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
