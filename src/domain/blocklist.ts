/**
 * The slur / protected-characteristic blocklist (v1-spec §4/§11; issue #24).
 *
 * The door's hard-block term list: dehumanizing slurs keyed to a protected
 * characteristic (race, ethnicity, religion, sexual orientation, gender
 * identity, disability). It is deliberately SHORT and unambiguous — the door
 * only catches what can be caught reliably with zero operator review (§11.A);
 * everything subtler (coded language, targeted-but-clean abuse) publishes and is
 * handled reactively by report → takedown (§11.B). Profanity is intentionally
 * absent: it is a bright-line guideline violation enforced *reactively*, not
 * door-blocked, to avoid false positives (§11).
 *
 * Matched case-insensitively on whole-word boundaries by
 * {@link ./review!checkReviewBody}. This is the seed list; an operator extends
 * it over time. Kept in its own module so the term data is isolated from the
 * matching logic and easy to audit or swap.
 */
export const SLUR_BLOCKLIST: readonly string[] = [
  "nigger",
  "nigga",
  "faggot",
  "fag",
  "retard",
  "retarded",
  "tranny",
  "kike",
  "spic",
  "chink",
  "wetback",
  "gook",
  "coon",
] as const;
