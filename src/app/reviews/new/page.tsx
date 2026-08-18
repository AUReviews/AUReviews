import type { Metadata } from "next";
import { getCurrentIdentityHash } from "@/auth/session";
import { getCourseByCode, listCourseInstructors } from "@/db/queries";
import { formatCourseCode, parseCourseSlug } from "@/lib/course-detail";
import { toCourseOption } from "@/lib/course-search";
import { currentSelectableTerms } from "@/lib/review-window";
import ReviewForm, { type ReviewFormPrefill } from "./ReviewForm";

// The review authoring page (v1-spec §4/§11/§13; issues #24/#40) — the ONE
// place a review is written. The course is data on the review, not a location:
// with `?course=<slug>` the course and its scoped instructor dropdown arrive
// prefilled (the course-page CTAs and the header button on a course page link
// this way); without it the form's server-backed course search supplies them.
// Both paths converge on the same posted slug, the same insert, and the same
// redirect back to the course page.
//
// Per-user and never cached — it reflects the signed-in state and the live
// rolling term window — so it is force-dynamic, unlike the CDN-static catalog
// pages. The heavy lifting (the live door, the required-core gate) lives in
// the client island; this server component only resolves any prefill and hands
// down the current selectable terms and auth state. A signed-out visitor is
// NOT sent away to sign in first (issue #47): the form carries the email +
// sign-in-code fields inline and the Post action does the exchange itself.
export const dynamic = "force-dynamic";

/**
 * Resolve a `?course=` slug into the form's prefill, or `null` when the param
 * is absent, malformed, or names no course we carry — the form then simply
 * opens on the course search instead of erroring, since the page stands on its
 * own without a course in hand.
 */
async function resolvePrefill(
  courseParam: string | undefined,
): Promise<ReviewFormPrefill | null> {
  if (!courseParam) return null;
  const parsed = parseCourseSlug(courseParam);
  if (!parsed) return null;
  const course = await getCourseByCode(parsed.subject, parsed.number);
  if (!course) return null;

  // The instructor dropdown is scoped to the course (§4): only the people who
  // actually taught it, plus the form's two unknown escapes (added client-side).
  const instructors = await listCourseInstructors(course.id);
  return { course: toCourseOption(course), instructors };
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ course?: string }>;
}): Promise<Metadata> {
  const { course } = await searchParams;
  const parsed = course ? parseCourseSlug(course) : null;
  // Resolve, don't just parse: a well-formed slug for a course we don't carry
  // renders the search fallback, so the title must not claim that course.
  const resolved = parsed
    ? await getCourseByCode(parsed.subject, parsed.number)
    : null;
  if (!resolved) return { title: "Add a review — AUReviews" };
  return {
    title: `Review ${formatCourseCode(resolved.subject, resolved.number)} — AUReviews`,
  };
}

export default async function NewReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string }>;
}) {
  const { course } = await searchParams;
  const prefill = await resolvePrefill(course);

  // The rolling window governs what term can be selected (§4); the same list is
  // re-derived in the submit action to reject an out-of-window term.
  const terms = currentSelectableTerms().map((t) => ({
    code: t.code,
    label: t.label,
  }));

  const signedIn = (await getCurrentIdentityHash()) !== null;

  return (
    <div className="add">
      <ReviewForm prefill={prefill} terms={terms} signedIn={signedIn} />
    </div>
  );
}
