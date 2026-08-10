import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  primaryKey,
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

/**
 * Verified-affiliate identities (v1-spec §7, research §4 option C; issue #19).
 *
 * This is BOTH the anonymity store and the Auth.js "user" table. It holds only a
 * non-reversible `identity_hash = HMAC(PEPPER, normalize(email))` and when it was
 * verified — NEVER the plaintext email (the pepper lives outside the DB, so a
 * dump yields nothing brute-forceable). `id` is an opaque surrogate the session
 * table references, so `sessions` never even stores the hash; the hash is looked
 * up server-side only when a write must be attributed. Reviews (#6) will key to
 * `identity_hash`, with no `(identity_hash, course_id)` uniqueness (v1-spec §4).
 */
export const identities = pgTable("identities", {
  id: uuid("id").primaryKey().defaultRandom(),
  identityHash: text("identity_hash").notNull().unique(),
  verifiedAt: timestamp("verified_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Auth.js database sessions (issue #19). An opaque `session_token` cookie maps
 * server-side to an identity; the client never receives `identity_hash` or the
 * address (v1-spec §7 step 4). Rows are deleted when the referenced identity is
 * (there is no self-delete of an identity in v1, but the cascade keeps the seam
 * honest).
 */
export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => identities.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

/**
 * Auth.js magic-link tokens (issue #19). Single-use and expiring (v1-spec §7:
 * one live token per address, 15–60 min). `identifier` is the target address,
 * held ONLY transiently here until the link is clicked or expires — it is the
 * one place an address touches the DB, and it is never copied into `identities`.
 * The adapter deletes any prior token for an identifier before issuing a new one
 * so only one link is ever live per address.
 */
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/**
 * Email-send throttle log (v1-spec §7, research §5; issue #19). One row per
 * issued magic link, used to enforce ≤3 sends/address/hour and ≤10 sends/IP/hour.
 * The address is stored as the same keyed hash as `identities.identity_hash`,
 * never plaintext, so per-address throttling costs no additional PII. Composite
 * indexes make the trailing-hour count a fast range scan; rows are prunable
 * beyond the window by a later maintenance job.
 */
export const emailSendLog = pgTable(
  "email_send_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    addressHash: text("address_hash").notNull(),
    ip: text("ip").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("email_send_log_address_idx").on(t.addressHash, t.createdAt),
    index("email_send_log_ip_idx").on(t.ip, t.createdAt),
  ],
);
