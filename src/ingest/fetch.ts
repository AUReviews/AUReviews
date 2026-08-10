/**
 * Bulletin fetcher (issue #18, v1-spec §9).
 *
 * Retrieves the public, crawl-permitted COMP catalog page. The full COMP catalog
 * is a single server-rendered page, so one polite GET with an identifying
 * User-Agent covers the whole import — no crawl loop, inherently gentle on the
 * bulletin. Kept out of `import.ts` so the orchestrator stays network-free and
 * testable; this is the one place that actually touches the wire.
 */
import { COMP_CATALOG_URL } from "./import";

const USER_AGENT =
  "AUReviews-ingest/1.0 (+https://aureviews.com; course-catalog import)";

/** GET the COMP catalog HTML, throwing on any non-2xx response. */
export async function fetchBulletinHtml(
  url: string = COMP_CATALOG_URL,
): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
  });

  if (!response.ok) {
    throw new Error(
      `Bulletin fetch failed: ${response.status} ${response.statusText} for ${url}`,
    );
  }

  return response.text();
}
