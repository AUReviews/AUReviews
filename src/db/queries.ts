import { desc } from "drizzle-orm";
import type { PlaceholderRow } from "@/domain";
import { getDb } from "./client";
import { placeholder } from "./schema";

/**
 * Read the newest placeholder row — the skeleton's DB proof-of-life. Returns
 * `null` when the table is empty (migrated but not yet seeded), which the page
 * renders as a "run the seed" state rather than an error.
 */
export async function getLatestPlaceholder(): Promise<PlaceholderRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(placeholder)
    .orderBy(desc(placeholder.createdAt))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return { id: row.id, message: row.message, createdAt: row.createdAt };
}
