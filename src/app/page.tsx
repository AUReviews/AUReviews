import { unstable_cache } from "next/cache";
import { formatPlaceholder } from "@/domain";
import { getLatestPlaceholder } from "@/db/queries";

// ISR: this page is CDN-static with a time-based fallback, and can be refreshed
// on demand via POST /api/revalidate { "tag": "placeholder" } (v1-spec §8).
export const revalidate = 3600;

// Cache the DB read under the "placeholder" tag so a write can call
// revalidateTag("placeholder") to refresh this page. The cached function returns
// a plain string (not a Date-carrying object) so nothing is lost across the
// cache's JSON boundary.
const loadPlaceholderLine = unstable_cache(
  async (): Promise<string | null> => {
    const row = await getLatestPlaceholder();
    return row ? formatPlaceholder(row) : null;
  },
  ["placeholder-line"],
  { tags: ["placeholder"] },
);

type PageState =
  | { kind: "ok"; line: string }
  | { kind: "empty" }
  | { kind: "error"; message: string };

async function loadState(): Promise<PageState> {
  try {
    const line = await loadPlaceholderLine();
    return line ? { kind: "ok", line } : { kind: "empty" };
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export default async function Home() {
  const state = await loadState();

  return (
    <main style={{ maxWidth: 640, margin: "4rem auto", padding: "0 1.5rem" }}>
      <h1 style={{ marginBottom: "0.25rem" }}>AUReviews</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        Walking skeleton — this line is read live from Neon Postgres.
      </p>

      {state.kind === "ok" && (
        <blockquote
          style={{
            borderLeft: "4px solid #0a7",
            margin: "1.5rem 0",
            padding: "0.75rem 1rem",
            background: "#f4fbf8",
          }}
        >
          {state.line}
        </blockquote>
      )}

      {state.kind === "empty" && (
        <p style={{ margin: "1.5rem 0", color: "#a60" }}>
          The database is reachable but the <code>placeholder</code> table is
          empty. Run <code>npm run db:seed</code> to seed the proof-of-life row.
        </p>
      )}

      {state.kind === "error" && (
        <div style={{ margin: "1.5rem 0" }}>
          <p style={{ color: "#b00" }}>
            Could not read from Postgres yet. This is expected until Neon is
            provisioned and migrations have run (see <code>docs/deploy.md</code>).
          </p>
          <pre
            style={{
              background: "#fbeaea",
              padding: "0.75rem 1rem",
              overflowX: "auto",
              fontSize: "0.85rem",
            }}
          >
            {state.message}
          </pre>
        </div>
      )}

      <footer style={{ marginTop: "3rem", fontSize: "0.8rem", color: "#888" }}>
        AUReviews is an independent, student-run website. It is not affiliated
        with, endorsed by, or connected to Auburn University.
      </footer>
    </main>
  );
}
