import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  integer,
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
 * Durable Instructor identities (v1-spec §3, ADR 0001; issue #23). Same
 * philosophy as `courses`: `id` is minted by the offerings planner, NOT a DB
 * default, and is never deleted by an import (ADR 0002). `displayName` is a
 * mutable last-import-wins attribute. `bannerKey` is Banner's stable person
 * key — the Auburn NetID lifted from the schedule page's `mailto:` link —
 * unique where present; instructors Banner lists without one are keyed by
 * `nameKey` (normalized display name) with ambiguous matches routed to
 * `instructor_pending`, never auto-merged.
 */
export const instructors = pgTable(
  "instructors",
  {
    id: uuid("id").primaryKey(),
    displayName: text("display_name").notNull(),
    bannerKey: text("banner_key").unique(),
    nameKey: text("name_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("instructors_name_key_idx").on(t.nameKey)],
);

/**
 * Offerings (v1-spec §3/§6; issue #23): the historical fact that a Course ran
 * in a Term, at exactly `(course, term)` grain — Banner's section rows are
 * collapsed before they get here, and Section is deliberately not modeled (no
 * CRNs/seats/meeting times). `termCode` is the validated Banner `YYYYT0` code
 * (`200810` = Fall 2007, the history floor). The composite key is the
 * idempotency anchor: re-imports converge instead of duplicating. "Typically
 * offered" is always computed from these rows at display time, never stored.
 */
export const offerings = pgTable(
  "offerings",
  {
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id),
    termCode: text("term_code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.courseId, t.termCode] })],
);

/**
 * The instructor-of-record set carried by each Offering (v1-spec §3). Rows are
 * catalog-side and re-derivable: a link may be dropped when a re-import shows
 * Banner no longer lists that instructor for the term, but the referenced
 * Instructor row itself is never deleted (ADR 0002). The composite key makes
 * link writes idempotent.
 */
export const offeringInstructors = pgTable(
  "offering_instructors",
  {
    courseId: uuid("course_id").notNull(),
    termCode: text("term_code").notNull(),
    instructorId: uuid("instructor_id")
      .notNull()
      .references(() => instructors.id),
  },
  (t) => [
    primaryKey({ columns: [t.courseId, t.termCode, t.instructorId] }),
    foreignKey({
      columns: [t.courseId, t.termCode],
      foreignColumns: [offerings.courseId, offerings.termCode],
    }),
    index("offering_instructors_instructor_idx").on(t.instructorId),
  ],
);

/**
 * Pending instructor-identity decisions (v1-spec §3; issue #23) — the
 * instructor analog of `crosswalk_pending`. An ambiguous match (a new Banner
 * key colliding with an existing instructor's name, or a keyless name matching
 * several instructors) lands here for an explicit admin decision instead of
 * being auto-merged. `nameKey` is unique so a repeated import doesn't re-queue
 * the same undecided sighting; `payload` carries what the import saw.
 */
export const instructorPending = pgTable("instructor_pending", {
  id: uuid("id").primaryKey().defaultRandom(),
  nameKey: text("name_key").notNull().unique(),
  displayName: text("display_name").notNull(),
  bannerKey: text("banner_key"),
  reason: text("reason").notNull(),
  candidateInstructorIds: jsonb("candidate_instructor_ids")
    .notNull()
    .default(sql`'[]'::jsonb`),
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Verified-student identities (v1-spec §7, research §4 option C; issue #19).
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
 * User-authored reviews (v1-spec §4; issue #24). The one permanent, append-only
 * Review-side record. References the durable `Course.id` and an optional durable
 * `Instructor.id` — both captured at write time, so no catalog refresh ever
 * moves a review (ADR 0001/0002); an import never touches this table.
 *
 * The instructor field is *required* at the form, but resolves to one of three
 * things: a real `instructorId`, or an explicit unknown recorded in
 * `instructorUnknown` (`not-listed` | `dont-remember`) with `instructorId` null.
 * An explicit unknown beats a bare null (§4) — a null `instructorId` with a null
 * `instructorUnknown` is never written.
 *
 * The optional "Course details" zone (`workloadShape` … `prep`) never blocks
 * submission (§4); multi-selects are stored as jsonb arrays, single-selects as
 * text, all nullable.
 *
 * `identityHash` is the author's HMAC token (§7), stored so an operator can
 * correlate one person's reviews — deliberately NOT a uniqueness key: there is
 * NO `(identity_hash, course_id)` unique index, so multiple correlated reviews
 * per person per course are allowed (§4 contradiction callout). `status`
 * defaults to `published`; `edited`/`contested` back the moderation flows (§11).
 */
export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id),
    // Null when the author chose an unknown escape; then `instructorUnknown`
    // carries which one. Never both null (an explicit unknown beats a null, §4).
    instructorId: uuid("instructor_id").references(() => instructors.id),
    // null | 'not-listed' | 'dont-remember' — the two §4 escape hatches.
    instructorUnknown: text("instructor_unknown"),
    // The validated Banner `YYYYT0` code of the term the review describes. The
    // actual term is always stored; the rolling window (§4) governs only what
    // can be selected at submit time, never what persists here.
    termCode: text("term_code").notNull(),
    // Required core (§4): 1–5, 1–5, 1–40. Ranges are enforced at the door
    // (domain/review.ts) and re-checked in the submit action.
    overall: integer("overall").notNull(),
    difficulty: integer("difficulty").notNull(),
    workloadHours: integer("workload_hours").notNull(),
    // Free text, ≥100 chars (door-blocked, §11). No maximum.
    body: text("body").notNull(),
    // Optional "Course details" (§4) — none can block submission.
    workloadShape: jsonb("workload_shape")
      .notNull()
      .default(sql`'[]'::jsonb`),
    grade: text("grade"),
    languages: jsonb("languages").notNull().default(sql`'[]'::jsonb`),
    languagesOther: text("languages_other"),
    curved: text("curved"),
    attendance: text("attendance"),
    prep: text("prep"),
    // System fields (§4). `identity_hash` is correlation-only, NOT unique here.
    identityHash: text("identity_hash").notNull(),
    // 'published' (default) | 'pending' | 'removed' | 'deleted' — text, no enum,
    // so the panic-switch/takedown states need no migration (§4/§11).
    status: text("status").notNull().default("published"),
    edited: boolean("edited").notNull().default(false),
    contested: boolean("contested").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Aggregates and the by-instructor breakdown (§5) scan by course; the author
    // correlation trail (§7) scans by identity. Neither index is unique — the
    // absence of a `(identity_hash, course_id)` unique constraint is deliberate.
    index("reviews_course_idx").on(t.courseId),
    index("reviews_identity_idx").on(t.identityHash),
  ],
);

/**
 * Per-voter helpful votes (v1-spec §4/§5; issue #24). Votes are retractable and
 * flippable (§10), so they are tracked per voter — one row per
 * `(review, identity)` — not as two bare counters on the review. `direction` is
 * `up` | `down`; the composite primary key makes a re-vote an upsert and caps
 * each identity at one live vote per review. Removing the row is a retraction.
 */
export const reviewVotes = pgTable(
  "review_votes",
  {
    reviewId: uuid("review_id")
      .notNull()
      .references(() => reviews.id, { onDelete: "cascade" }),
    identityHash: text("identity_hash").notNull(),
    direction: text("direction").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.reviewId, t.identityHash] })],
);

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
 * Auth.js sign-in code tokens (issues #19, #43). Single-use and expiring
 * (v1-spec §7: one live token per address). `identifier` is the PEPPERED HASH
 * of the target address — `HMAC(PEPPER, normalize(email))`, the same derivation
 * as `identity_hash` — so the plaintext address is never at rest anywhere, even
 * transiently. `token` is the 6-digit code hashed with the Auth.js secret.
 * The adapter deletes any prior token for an identifier before issuing a new
 * one so only one code is ever live per address, and `attempts` counts wrong
 * guesses so the code dies after a bounded number of tries (#43).
 */
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/**
 * Email-send throttle log (v1-spec §7, research §5; issue #19). One row per
 * issued sign-in code, used to enforce ≤3 sends/address/hour and ≤10 sends/IP/hour.
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
