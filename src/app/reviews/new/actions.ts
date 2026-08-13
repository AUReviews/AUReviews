"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import {
  ATTENDANCE_OPTIONS,
  CURVED_OPTIONS,
  GRADE_OPTIONS,
  type InstructorUnknown,
  LANGUAGE_OPTIONS,
  PREP_OPTIONS,
  type ReviewFieldError,
  WORKLOAD_SHAPE_OPTIONS,
  parseInstructorChoice,
  sanitizeMultiSelect,
  sanitizeSingleSelect,
  validateReviewCore,
} from "@/domain";
import { getCurrentIdentityHash } from "@/auth/session";
import {
  type CourseInstructor,
  getCourseByCode,
  insertReview,
  listCourseInstructors,
  searchCoursesByText,
} from "@/db/queries";
import { courseHref, parseCourseSlug } from "@/lib/course-detail";
import {
  type CourseOption,
  normalizeCourseSearchQuery,
  toCourseOption,
} from "@/lib/course-search";
import { currentSelectableTerms } from "@/lib/review-window";

/**
 * The course picker's server-backed typeahead (issue #40): match the typed
 * fragment against catalog code + title and return at most a handful of
 * options, so the catalog itself never ships to the client. A too-short query
 * is no results, not an error — the picker just keeps prompting.
 */
export async function searchCourseOptions(
  rawQuery: string,
): Promise<CourseOption[]> {
  const query = normalizeCourseSearchQuery(String(rawQuery ?? ""));
  if (!query) return [];
  const rows = await searchCoursesByText(query);
  return rows.map(toCourseOption);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Load the instructor dropdown for a just-picked course (issue #40): the same
 * course-scoped `listCourseInstructors` read the prefilled path uses, exposed
 * as an action so the picker can populate the dropdown on select. The two
 * "unknown" escapes stay client-side (§4) — they aren't instructors. A
 * malformed id returns the empty list rather than erroring: the id is only
 * ever one we handed out in a search option, so anything else is a crafted
 * call, and the submit action re-checks instructor-taught-course anyway.
 */
export async function listInstructorOptions(
  courseId: string,
): Promise<CourseInstructor[]> {
  if (!UUID_RE.test(courseId)) return [];
  return listCourseInstructors(courseId);
}

/**
 * The result the submit action hands back to the form island (issue #24). A
 * clean submit never returns — it `revalidatePath`s the course page and
 * redirects there — so a returned state is always a rejection the form
 * re-renders: `formError` for whole-form problems (not signed in, unknown
 * course), or per-field `errors` from the §4/§11 gate.
 */
export interface ReviewFormState {
  formError?: string;
  errors?: ReviewFieldError[];
}

/**
 * Submit a review (v1-spec §4/§11; issue #24). This is the AUTHORITATIVE gate:
 * the form runs the same `validateReviewCore` live to keep Submit disabled, but
 * everything is re-checked here so a crafted POST can't bypass the door. It also
 * re-derives the selectable term window server-side, so a stale client can't
 * post an out-of-window term. On success it inserts the review, revalidates the
 * affected course page (§4's "revalidate the affected course"), and redirects
 * back to it.
 */
export async function submitReview(
  _prev: ReviewFormState,
  formData: FormData,
): Promise<ReviewFormState> {
  // 1. Auth: only a signed-in Auburn student may author (§7). The session
  //    resolves to the author token server-side; it never reaches the client.
  const identityHash = await getCurrentIdentityHash();
  if (!identityHash) {
    return { formError: "Sign in with your Auburn email to post a review." };
  }

  // 2. Resolve the course from the posted slug to its durable id (captured at
  //    write time, ADR 0001). A bad slug/unknown course is a whole-form error.
  const slug = String(formData.get("courseSlug") ?? "");
  const parsed = parseCourseSlug(slug);
  const course = parsed ? await getCourseByCode(parsed.subject, parsed.number) : null;
  if (!course) {
    return { formError: "That course could not be found." };
  }

  // 3. Re-derive the live window and validate the required core + body door.
  const selectableTermCodes = currentSelectableTerms().map((t) => t.code);
  const instructor = parseInstructorChoice(str(formData.get("instructor")));
  const core = {
    overall: intOrNull(formData.get("overall")),
    difficulty: intOrNull(formData.get("difficulty")),
    workloadHours: intOrNull(formData.get("workloadHours")),
    termCode: str(formData.get("termCode")),
    instructor,
    body: String(formData.get("body") ?? ""),
  };
  const errors = validateReviewCore(core, { selectableTermCodes });
  if (errors.length > 0) {
    return { errors };
  }

  // 4. Resolve the instructor choice into id XOR unknown-sentinel, and confirm a
  //    real id actually taught this course (the dropdown was course-scoped, but
  //    re-check so a forged id can't attach a review to an unrelated instructor).
  //    `validateReviewCore` above already guaranteed a non-null choice.
  const choice = instructor!;
  let instructorId: string | null = null;
  let instructorUnknown: InstructorUnknown | null = null;
  if (choice.kind === "instructor") {
    const taught = await listCourseInstructors(course.id);
    if (!taught.some((i) => i.id === choice.id)) {
      return {
        errors: [{ field: "instructor", message: "Choose an instructor from the list." }],
      };
    }
    instructorId = choice.id;
  } else {
    instructorUnknown = choice.kind;
  }

  // 5. Sanitize the optional "Course details" — kept only if recognized, never
  //    blocking (§4). Multi-selects come through as repeated form fields.
  const languages = sanitizeMultiSelect(strList(formData.getAll("languages")), LANGUAGE_OPTIONS);
  const languagesOther = languages.includes("Other")
    ? str(formData.get("languagesOther"))?.slice(0, 60) ?? null
    : null;

  await insertReview({
    courseId: course.id,
    instructorId,
    instructorUnknown,
    termCode: core.termCode!,
    overall: core.overall!,
    difficulty: core.difficulty!,
    workloadHours: core.workloadHours!,
    body: core.body.trim(),
    identityHash,
    workloadShape: sanitizeMultiSelect(
      strList(formData.getAll("workloadShape")),
      WORKLOAD_SHAPE_OPTIONS,
    ),
    grade: sanitizeSingleSelect(str(formData.get("grade")), GRADE_OPTIONS),
    languages,
    languagesOther,
    curved: sanitizeSingleSelect(str(formData.get("curved")), CURVED_OPTIONS),
    attendance: sanitizeSingleSelect(str(formData.get("attendance")), ATTENDANCE_OPTIONS),
    prep: sanitizeSingleSelect(str(formData.get("prep")), PREP_OPTIONS),
  });

  // 6. Revalidate what the new review changed (§4/§5/§8): the affected course
  //    page (headline, list), and the "reviews" tag so the browse index's
  //    rating columns recompute — every other page stays CDN-served. The tag
  //    must go through `updateTag`, the Server-Action read-your-own-writes
  //    form that expires immediately: `revalidateTag(tag, "max")` is
  //    stale-while-revalidate, which left the browse table serving the old
  //    numbers on the author's very next visit. Then land the author back on
  //    the course they just reviewed. `redirect` throws, so control never
  //    falls through to a return.
  const href = courseHref(course.subject, course.number);
  revalidatePath(href);
  updateTag("reviews");
  redirect(href);
}

function str(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function strList(vs: FormDataEntryValue[]): string[] {
  return vs.filter((v): v is string => typeof v === "string");
}

function intOrNull(v: FormDataEntryValue | null): number | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
