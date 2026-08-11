import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentIdentityHash } from "@/auth/session";
import { getCourseByCode, listCourseInstructors } from "@/db/queries";
import {
  courseHref,
  courseSlug,
  formatCourseCode,
  parseCourseSlug,
} from "@/lib/course-detail";
import { currentSelectableTerms } from "@/lib/review-window";
import ReviewForm from "./ReviewForm";

// The review submission ("Add") form (v1-spec §4/§11/§13; issue #24). Per-user
// and never cached — it reflects the signed-in state and the live rolling term
// window — so it is force-dynamic, unlike the CDN-static catalog pages. The
// heavy lifting (the live door, the required-core gate) lives in the client
// island; this server component only resolves the course, scopes the instructor
// dropdown, and hands down the current selectable terms and auth state.
export const dynamic = "force-dynamic";

async function resolveCourse(code: string) {
  const parsed = parseCourseSlug(code);
  if (!parsed) return null;
  const course = await getCourseByCode(parsed.subject, parsed.number);
  // Carry the normalized slug alongside the course: the submit action re-parses
  // it to re-resolve the durable id, so the form posts the canonical form rather
  // than whatever casing the URL arrived in.
  return course ? { course, slug: courseSlug(parsed.subject, parsed.number) } : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const resolved = await resolveCourse(code);
  if (!resolved) return { title: "Course not found — AUReviews" };
  const label = formatCourseCode(resolved.course.subject, resolved.course.number);
  return { title: `Review ${label} — AUReviews` };
}

export default async function ReviewFormPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const resolved = await resolveCourse(code);
  if (!resolved) notFound();
  const { course, slug } = resolved;

  // The instructor dropdown is scoped to the course (§4): only the people who
  // actually taught it, plus the form's two unknown escapes.
  const instructors = await listCourseInstructors(course.id);

  // The rolling window governs what term can be selected (§4); the same list is
  // re-derived in the submit action to reject an out-of-window term.
  const terms = currentSelectableTerms().map((t) => ({
    code: t.code,
    label: t.label,
  }));

  const signedIn = (await getCurrentIdentityHash()) !== null;
  const href = courseHref(course.subject, course.number);
  const label = `${formatCourseCode(course.subject, course.number)} · ${course.title}`;

  return (
    <div className="add">
      <ReviewForm
        courseSlug={slug}
        courseLabel={label}
        courseHref={href}
        instructors={instructors}
        terms={terms}
        signedIn={signedIn}
        signInHref="/signin"
      />
    </div>
  );
}
