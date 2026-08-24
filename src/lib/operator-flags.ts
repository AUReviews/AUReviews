/**
 * Edge Config reader for the §12 break-glass flags (issue #28).
 *
 * The thin adapter around the pure `normalizeOperatorFlags` (src/domain/
 * operations.ts): fetch `moderationMode` and `readOnly` from the Vercel Edge
 * Config store attached via the `EDGE_CONFIG` env var, and fold whatever comes
 * back into typed {@link OperatorFlags}. Reads are Vercel-edge-cached and
 * propagate dashboard flips in seconds with no redeploy — which is the entire
 * point (§12: works from a phone).
 *
 * Every failure path — no store attached (local dev, preview without the
 * integration), a network error, malformed values — degrades to the launch
 * defaults (`open`, writable) rather than throwing: an Edge Config outage must
 * never take the review form down, and the flags' defaults ARE normal
 * operation. The one place this trades off is that an outage also masks a
 * flipped flag; §12 accepts that (the flags are best-effort crisis valves, not
 * a security boundary — the authoritative content gate stays in the actions).
 */
import { createClient } from "@vercel/edge-config";
import { type OperatorFlags, normalizeOperatorFlags } from "@/domain";

/**
 * Read both flags for one request. Called per-write (submit/edit) and on the
 * review-form render — not on catalog/read paths, which the flags never gate.
 */
export async function getOperatorFlags(): Promise<OperatorFlags> {
  const connection = process.env.EDGE_CONFIG;
  if (!connection) return normalizeOperatorFlags(null);
  try {
    const client = createClient(connection);
    const raw = await client.getAll(["moderationMode", "readOnly"]);
    return normalizeOperatorFlags(raw);
  } catch (error) {
    console.error("operator-flags: Edge Config read failed", error);
    return normalizeOperatorFlags(null);
  }
}
