/**
 * Global Config reader for the §12 break-glass flags (issue #28).
 *
 * The thin adapter around the pure `normalizeOperatorFlags` (src/domain/
 * operator-flags.ts): fetch `moderationMode` and `readOnly` from the Vercel
 * Global Config store (formerly Edge Config; a store connected today attaches
 * as `GLOBAL_CONFIG`, an older one as `EDGE_CONFIG`, so both are honored) and
 * fold whatever comes back into typed {@link OperatorFlags}. Reads are
 * edge-cached and propagate dashboard flips in seconds with no redeploy —
 * which is the entire point (§12: works from a phone).
 *
 * Every failure path — no store attached (local dev, preview without the
 * integration), a network error, malformed values — degrades to the launch
 * defaults (`open`, writable) rather than throwing: a Global Config outage
 * must never take the review form down, and the flags' defaults ARE normal
 * operation. The one place this trades off is that an outage also masks a
 * flipped flag; §12 accepts that (the flags are best-effort crisis valves, not
 * a security boundary — the authoritative content gate stays in the actions).
 */
import { createClient } from "@vercel/global-config";
import {
  DEFAULT_OPERATOR_FLAGS,
  type OperatorFlags,
  normalizeOperatorFlags,
} from "@/domain";

/**
 * Read both flags for one request. Called per-write (submit/edit) and on the
 * review-form render — not on catalog/read paths, which the flags never gate.
 */
export async function getOperatorFlags(): Promise<OperatorFlags> {
  const connection = process.env.GLOBAL_CONFIG ?? process.env.EDGE_CONFIG;
  if (!connection) return DEFAULT_OPERATOR_FLAGS;
  try {
    const client = createClient(connection);
    const raw = await client.getAll(["moderationMode", "readOnly"]);
    return normalizeOperatorFlags(raw);
  } catch (error) {
    console.error("operator-flags: Global Config read failed", error);
    return DEFAULT_OPERATOR_FLAGS;
  }
}
