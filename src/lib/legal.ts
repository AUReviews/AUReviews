/**
 * Legal copy shared by the footer, the review form, and the legal pages
 * (v1-spec §10/§11/§13; issue #29).
 *
 * One source so the non-affiliation disclaimer, the prohibited-content list, and
 * the legal routes can't drift apart between surfaces. Pure and browser-safe:
 * the review form's client island imports it.
 *
 * NOTHING HERE IS LEGAL ADVICE. The copy is placeholder-final: the §10 attorney
 * consult (a launch-checklist item, not this ticket) confirms the items in
 * {@link ATTORNEY_CONFIRM_ITEMS} before launch. Each is marked `🔴 attorney` at
 * the spot in the copy it governs.
 */
import { BODY_MIN_LENGTH } from "@/domain/review";
import { RETENTION_DAYS } from "@/domain/activity";

/** The non-affiliation disclaimer rendered in the footer of every page. The
 * §10 draft also carried a trademark sentence; maintainer decision (issue #29)
 * keeps the footer to this one line and moves that sentence to
 * {@link TRADEMARK_NOTICE}, shown on the Terms page. */
export const NON_AFFILIATION_DISCLAIMER =
  "AUReviews is an independent, student-run website. It is not affiliated with, " +
  "endorsed by, or connected to Auburn University.";

/** The §10 nominative-use sentence for Auburn's marks. Rendered on the Terms
 * page under the non-affiliation heading, not in the footer. */
export const TRADEMARK_NOTICE =
  "“Auburn University,” “Auburn,” “War Eagle,” and related marks are trademarks " +
  "of Auburn University, used here only to identify the institution whose courses " +
  "are reviewed.";

export type LegalPageKey = "terms" | "privacy" | "guidelines";

export const LEGAL_LINKS: readonly { key: LegalPageKey; href: string; label: string }[] = [
  { key: "terms", href: "/terms", label: "Terms of Service" },
  { key: "privacy", href: "/privacy", label: "Privacy Policy" },
  { key: "guidelines", href: "/guidelines", label: "Review Guidelines" },
];

export function legalPageHref(key: LegalPageKey): string {
  const link = LEGAL_LINKS.find((l) => l.key === key);
  if (!link) throw new Error(`unknown legal page: ${key}`);
  return link.href;
}

/** The always-on legal contact (§10/§12). 🔴 attorney / ops: alias must exist
 * before launch. */
export const LEGAL_CONTACT_EMAIL = "admin@aureviews.com";

/** Soft-delete windows before content purges to a tombstone (§11). The
 * numbers live in the domain (`@/domain/activity`, issue #26) next to the
 * countdown the My Activity page shows; re-exported so the legal copy quotes
 * the same figures. 🔴 attorney-confirm they don't conflict with
 * litigation-hold duties. */
export { RETENTION_DAYS };

/** What the door blocks automatically at submit time (§11.A), for the
 * guideline copy. Everything else is reactive (report → takedown). */
export const DOOR_BLOCK_SUMMARY =
  `Links, email addresses, phone numbers, slurs, and reviews under ${BODY_MIN_LENGTH} ` +
  "characters are blocked automatically before you can post. Everything else is " +
  "published immediately and removed only if it's reported and found to break these guidelines.";

/** The §11 prohibited (takedown-eligible) categories, shared by the in-form panel
 * and the full Review Guidelines page. Deliberately omits the RateMyProfessors
 * claims §11 rules out (one-review-per-course, "we read every review", content
 * assignment, IP hand-over threats). */
export const PROHIBITED_CONTENT: readonly { title: string; detail: string }[] = [
  {
    title: "Accusations of misconduct or illegal activity",
    detail:
      "Don't accuse a named person of a crime, academic misconduct, harassment, or other wrongdoing. Describe your own experience of the course instead.",
  },
  {
    title: "Protected characteristics or appearance",
    detail:
      "No remarks about anyone's race, ethnicity, religion, sex, sexual orientation, gender identity, disability, age, national origin, or physical appearance.",
  },
  {
    title: "Identifying or contact information",
    detail:
      "No email addresses, phone numbers, home addresses, social-media handles, or links, yours or anyone else's.",
  },
  {
    title: "TAs and other students",
    detail:
      "Reviews cover only the course and its instructor of record. Don't write about TAs, graders, or other students.",
  },
  {
    title: "Profanity",
    detail: "Keep it clean. Profanity isn't blocked automatically, but it is grounds for removal.",
  },
  {
    title: "Wrong course or off-topic",
    detail:
      "Review the course you selected, as you took it. Don't use a review to talk about a different course, the department, or unrelated topics.",
  },
  {
    title: "Spam, impersonation, or self-review",
    detail:
      "No advertising, no posting as someone you're not, and no reviewing a course you teach or assist.",
  },
];

/** Copy the §10 attorney consult must confirm before launch. Surfaced here so the
 * launch checklist has one place to look; the pages mark each spot inline. */
export const ATTORNEY_CONFIRM_ITEMS: readonly string[] = [
  "Governing law and any arbitration clause in the Terms of Service.",
  `Retention windows (${RETENTION_DAYS.deleted}-day self-delete, ${RETENTION_DAYS.removed}-day takedown) against litigation-hold duties.`,
  "Name clearance for “AUReviews” against Auburn University's marks.",
  "The subpoena-notification practice described in the Privacy Policy.",
];
