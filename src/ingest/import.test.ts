import { describe, expect, it } from "vitest";
import {
  type CatalogSnapshot,
  type CourseId,
  type IngestPlan,
  normalizeCatalogKey,
} from "@/domain";
import { type IngestDeps, runIngest } from "./import";

/**
 * An in-memory stand-in for the catalog-side tables that applies a plan with the
 * same semantics as src/db/catalog.ts — create+map, apply(last-import-wins,
 * un-retire), pending(dedupe by key), retire(status flip). It lets us drive the
 * whole pipeline (parse → plan → apply) across successive imports and assert the
 * import-contract invariants end to end, no Postgres required.
 */
class FakeCatalogStore {
  courses = new Map<
    CourseId,
    { id: CourseId; subject: string; number: string; title: string; status: "active" | "retired" }
  >();
  crosswalk = new Map<string, CourseId>();
  pending = new Map<string, { reason: string }>();

  snapshot = async (): Promise<CatalogSnapshot> => ({
    courses: [...this.courses.values()].map((c) => ({
      id: c.id,
      catalogKey: normalizeCatalogKey(c),
      title: c.title,
      status: c.status,
    })),
    crosswalk: [...this.crosswalk.entries()].map(([catalogKey, courseId]) => ({
      catalogKey,
      courseId,
    })),
    pendingKeys: [...this.pending.keys()],
  });

  apply = async (plan: IngestPlan): Promise<void> => {
    for (const c of plan.creates) {
      this.courses.set(c.courseId, {
        id: c.courseId,
        subject: c.attributes.subject,
        number: c.attributes.number,
        title: c.attributes.title,
        status: "active",
      });
      this.crosswalk.set(c.catalogKey, c.courseId);
    }
    for (const a of plan.applies) {
      const existing = this.courses.get(a.courseId)!;
      this.courses.set(a.courseId, {
        ...existing,
        subject: a.attributes.subject,
        number: a.attributes.number,
        title: a.attributes.title,
        status: "active",
      });
    }
    for (const p of plan.pendings) {
      if (!this.pending.has(p.catalogKey)) {
        this.pending.set(p.catalogKey, { reason: p.reason });
      }
    }
    for (const id of plan.retirements) {
      const existing = this.courses.get(id)!;
      this.courses.set(id, { ...existing, status: "retired" });
    }
  };
}

/** Build a bulletin page from `(number, title)` pairs in CourseLeaf markup. */
function page(courses: Array<[string, string]>): string {
  const blocks = courses
    .map(
      ([number, title]) => `
      <div class="courseblock">
        <p class="courseblocktitle"><strong>COMP ${number} ${title} (3)</strong></p>
        <p class="courseblockdesc">A course about ${title.toLowerCase()}.</p>
      </div>`,
    )
    .join("\n");
  return `<div id="courseinventorycontainer">${blocks}</div>`;
}

function deps(store: FakeCatalogStore, html: string): IngestDeps {
  return {
    fetchHtml: async () => html,
    loadSnapshot: store.snapshot,
    applyPlan: store.apply,
    catalogYear: "2026-2027",
  };
}

describe("runIngest", () => {
  it("writes the full COMP catalog on a first run, minting durable ids", async () => {
    const store = new FakeCatalogStore();
    const html = page([
      ["1000", "PERSONAL COMPUTER APPLICATIONS"],
      ["2210", "FUNDAMENTALS OF COMPUTING II"],
    ]);

    const summary = await runIngest(deps(store, html));

    expect(summary).toMatchObject({ parsed: 2, created: 2, updated: 0, retired: 0 });
    expect(store.courses.size).toBe(2);
    // Every course carries a durable id independent of (subject, number).
    for (const c of store.courses.values()) {
      expect(c.id).not.toBe(normalizeCatalogKey(c));
      expect(c.id).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it("is idempotent: re-running the identical catalog creates nothing new", async () => {
    const store = new FakeCatalogStore();
    const html = page([
      ["1000", "PERSONAL COMPUTER APPLICATIONS"],
      ["2210", "FUNDAMENTALS OF COMPUTING II"],
    ]);

    await runIngest(deps(store, html));
    const idsAfterFirst = [...store.courses.keys()].sort();

    const summary = await runIngest(deps(store, html));

    expect(summary).toMatchObject({ created: 0, updated: 2, pending: 0, retired: 0 });
    expect([...store.courses.keys()].sort()).toEqual(idsAfterFirst);
  });

  it("keeps a course's durable id stable when its title changes (last-import-wins)", async () => {
    const store = new FakeCatalogStore();
    await runIngest(deps(store, page([["2210", "FUNDAMENTALS OF COMPUTING II"]])));
    const id = [...store.courses.keys()][0];

    await runIngest(deps(store, page([["2210", "DATA STRUCTURES"]])));

    expect(store.courses.get(id)!.title).toBe("DATA STRUCTURES");
    expect(store.courses.size).toBe(1);
  });

  it("retires a dropped-out course instead of deleting it, and un-retires on return", async () => {
    const store = new FakeCatalogStore();
    await runIngest(
      deps(store, page([
        ["1000", "PERSONAL COMPUTER APPLICATIONS"],
        ["2210", "FUNDAMENTALS OF COMPUTING II"],
      ])),
    );
    const comp1000Id = [...store.courses.values()].find((c) => c.number === "1000")!.id;

    // COMP 1000 drops out of the catalog.
    const retireSummary = await runIngest(
      deps(store, page([["2210", "FUNDAMENTALS OF COMPUTING II"]])),
    );
    expect(retireSummary.retired).toBe(1);
    expect(store.courses.get(comp1000Id)!.status).toBe("retired"); // not deleted
    expect(store.courses.size).toBe(2);

    // It reappears — same durable id, flipped back to active.
    await runIngest(
      deps(store, page([
        ["1000", "PERSONAL COMPUTER APPLICATIONS"],
        ["2210", "FUNDAMENTALS OF COMPUTING II"],
      ])),
    );
    expect(store.courses.get(comp1000Id)!.status).toBe("active");
    expect(store.courses.size).toBe(2);
  });

  it("routes a dropped-out renumber to pending, retiring the old number, minting nothing", async () => {
    const store = new FakeCatalogStore();
    await runIngest(deps(store, page([["2210", "FUNDAMENTALS OF COMPUTING II"]])));
    const comp2210Id = [...store.courses.values()][0].id;

    // COMP 2210 disappears and the same title shows up under COMP 2220 — a
    // candidate renumber only a human should confirm.
    const summary = await runIngest(
      deps(store, page([["2220", "FUNDAMENTALS OF COMPUTING II"]])),
    );

    expect(summary.pending).toBe(1);
    expect(summary.created).toBe(0);
    expect(summary.retired).toBe(1);
    expect(store.pending.get("COMP 2220")?.reason).toBe("possible-renumber");
    expect(store.courses.get(comp2210Id)!.status).toBe("retired"); // old kept, retired
    expect(store.courses.size).toBe(1); // no new durable course minted
  });
});
