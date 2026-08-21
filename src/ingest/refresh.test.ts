import { describe, expect, it } from "vitest";
import type { IngestSummary } from "./import";
import type { OfferingsIngestSummary } from "./import-offerings";
import {
  formatRefreshAnnotations,
  pingRevalidate,
  type RefreshDeps,
  runCatalogRefresh,
} from "./refresh";

const catalogSummary = (pending = 0): IngestSummary => ({
  parsed: 10,
  created: 1,
  updated: 9,
  pending,
  retired: 0,
});

const offeringsSummary = (
  pending = 0,
  unmatchedCatalogKeys: string[] = [],
): OfferingsIngestSummary => ({
  terms: 2,
  offeringsSeen: 20,
  offeringsCreated: 3,
  instructorsCreated: 1,
  instructorsRenamed: 0,
  linksAdded: 2,
  linksRemoved: 0,
  pending,
  unmatchedCatalogKeys,
});

function deps(overrides: Partial<RefreshDeps> = {}): RefreshDeps & {
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    runCatalog: async () => {
      calls.push("catalog");
      return catalogSummary();
    },
    runOfferings: async () => {
      calls.push("offerings");
      return offeringsSummary();
    },
    revalidate: async () => {
      calls.push("revalidate");
    },
    ...overrides,
  };
}

describe("runCatalogRefresh", () => {
  it("runs catalog, then offerings, then revalidates — in that order", async () => {
    const d = deps();
    const result = await runCatalogRefresh(d);
    expect(d.calls).toEqual(["catalog", "offerings", "revalidate"]);
    expect(result.catalog).toEqual(catalogSummary());
    expect(result.offerings).toEqual(offeringsSummary());
  });

  it("reports the summary before revalidating so a failed ping never hides pending-row warnings", async () => {
    const d = deps({
      revalidate: async () => {
        throw new Error("revalidate 503");
      },
    });
    const reported: string[] = [];
    await expect(
      runCatalogRefresh({
        ...d,
        report: (summary) => {
          reported.push(`pending=${summary.catalog.pending}`);
          d.calls.push("report");
        },
      }),
    ).rejects.toThrow("revalidate 503");
    expect(d.calls).toEqual(["catalog", "offerings", "report"]);
    expect(reported).toEqual(["pending=0"]);
  });

  it("does not revalidate when the catalog import throws", async () => {
    const d = deps({
      runCatalog: async () => {
        throw new Error("bulletin down");
      },
    });
    await expect(runCatalogRefresh(d)).rejects.toThrow("bulletin down");
    expect(d.calls).toEqual([]);
  });

  it("does not revalidate when the offerings import throws", async () => {
    const d = deps({
      runOfferings: async () => {
        throw new Error("banner down");
      },
    });
    await expect(runCatalogRefresh(d)).rejects.toThrow("banner down");
    expect(d.calls).toEqual(["catalog"]);
  });
});

describe("formatRefreshAnnotations", () => {
  it("is silent when nothing is pending or unmatched", () => {
    expect(
      formatRefreshAnnotations({
        catalog: catalogSummary(),
        offerings: offeringsSummary(),
      }),
    ).toEqual([]);
  });

  it("emits a ::warning:: for pending crosswalk rows", () => {
    const lines = formatRefreshAnnotations({
      catalog: catalogSummary(2),
      offerings: offeringsSummary(),
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^::warning( title=[^:]*)?::/);
    expect(lines[0]).toContain("2 pending crosswalk");
  });

  it("emits a ::warning:: for pending instructor merges", () => {
    const lines = formatRefreshAnnotations({
      catalog: catalogSummary(),
      offerings: offeringsSummary(3),
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^::warning( title=[^:]*)?::/);
    expect(lines[0]).toContain("3 pending instructor");
  });

  it("emits a ::notice:: for unmatched Banner codes", () => {
    const lines = formatRefreshAnnotations({
      catalog: catalogSummary(),
      offerings: offeringsSummary(0, ["comp:9999"]),
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^::notice( title=[^:]*)?::/);
    expect(lines[0]).toContain("comp:9999");
  });

  it("keeps annotations to a single line each", () => {
    const lines = formatRefreshAnnotations({
      catalog: catalogSummary(1),
      offerings: offeringsSummary(1, ["a", "b"]),
    });
    expect(lines).toHaveLength(3);
    for (const line of lines) expect(line).not.toContain("\n");
  });
});

describe("pingRevalidate", () => {
  it("POSTs the catalog tag with the bearer secret to /api/revalidate", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      seen.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    await pingRevalidate(
      { baseUrl: "https://aureviews.example/", secret: "s3cret" },
      fetchImpl,
    );

    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe("https://aureviews.example/api/revalidate");
    expect(seen[0].init.method).toBe("POST");
    const headers = new Headers(seen[0].init.headers);
    expect(headers.get("authorization")).toBe("Bearer s3cret");
    expect(headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(String(seen[0].init.body))).toEqual({ tag: "catalog" });
  });

  it("throws on a non-2xx response so the job fails loudly", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ ok: false, error: "Unauthorized." }), {
        status: 401,
      });

    await expect(
      pingRevalidate(
        { baseUrl: "https://aureviews.example", secret: "wrong" },
        fetchImpl,
      ),
    ).rejects.toThrow(/401/);
  });
});
