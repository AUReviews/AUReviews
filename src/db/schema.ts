import { sql } from "drizzle-orm";
import {
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

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

/**
 * Catalog-side Course (v1-spec §3, ADR 0001/0002; issue #18).
 *
 * The durable, review-anchoring unit. `id` is an internally-minted surrogate we
 * own — NOT a default in the DB, because the crosswalk mints it (ADR 0001) so a
 * renumber never moves reviews. Auburn's `(subject, number, title, description,
 * creditHours, prereqText)` are mutable current attributes, last-import-wins.
 * `status` flips `active`↔`retired`; a catalog dropout is retired, never deleted
 * (ADR 0002). `formerIdentities` keeps a lightweight number/title history so an
 * old review can render in the context it was written.
 */
export const courses = pgTable("courses", {
  id: uuid("id").primaryKey(),
  subject: text("subject").notNull(),
  number: text("number").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  // Verbatim credit token ("4", or a range like "1-3"); text so variable-credit
  // courses aren't lost. A structured numeric model is a later ticket (§9).
  creditHours: text("credit_hours"),
  // Verbatim `Pr.`/`Coreq.` prose; structured parsing is a later ticket (§9).
  prereqText: text("prereq_text"),
  catalogYear: text("catalog_year").notNull(),
  // 'active' | 'retired' — see ADR 0002. Kept as text (no enum) to stay cheap.
  status: text("status").notNull().default("active"),
  // Array of { subject, number, title, catalogYearRange } — numbering/title only.
  formerIdentities: jsonb("former_identities")
    .notNull()
    .default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * The crosswalk (v1-spec §3, ADR 0002): the single bridge mapping a normalized
 * Auburn `(subject number)` catalog key to a durable Course. Unambiguous matches
 * live here and are applied automatically on import; a Course may accumulate more
 * than one key across renumbers (all pointing at the same durable id). The unique
 * `catalog_key` is what makes re-imports idempotent — one key resolves to exactly
 * one Course.
 */
export const courseCrosswalk = pgTable("course_crosswalk", {
  id: uuid("id").primaryKey().defaultRandom(),
  catalogKey: text("catalog_key").notNull().unique(),
  courseId: uuid("course_id")
    .notNull()
    .references(() => courses.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Pending crosswalk decisions (v1-spec §3/§12, ADR 0002): ambiguous incoming keys
 * — candidate renumbers, splits, merges, cross-lists — that an import must NEVER
 * infer. They land here for an explicit admin decision (resolution mechanics are
 * a later ticket). `catalogKey` is unique so a repeated import doesn't re-queue
 * the same undecided key. `payload` carries the full scraped attributes so a
 * human resolving it has everything the import saw.
 */
export const crosswalkPending = pgTable("crosswalk_pending", {
  id: uuid("id").primaryKey().defaultRandom(),
  catalogKey: text("catalog_key").notNull().unique(),
  title: text("title").notNull(),
  reason: text("reason").notNull(),
  candidateCourseIds: jsonb("candidate_course_ids")
    .notNull()
    .default(sql`'[]'::jsonb`),
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
