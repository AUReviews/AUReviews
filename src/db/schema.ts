import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Skeleton-only proof-of-life table (v1-spec §8).
 *
 * The deployed page reads this table's newest row to prove hosting → app → DB
 * is wired. The real catalog/review tables arrive in #18/#19/#6; this table can
 * be dropped once they exist. It is intentionally trivial so it makes no schema
 * commitments the later tickets would have to unwind.
 */
export const placeholder = pgTable("placeholder", {
  id: serial("id").primaryKey(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
