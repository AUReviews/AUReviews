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
  isUuid,
  parseInstructorChoice,
  sanitizeMultiSelect,
  sanitizeSingleSelect,
  validateReviewCore,
} from "@/domain";
import { exchangeCodeForSession, type ExchangeFailure } from "@/auth/exchange";
import { getCurrentIdentityHash } from "@/auth/session";
import {
  type CourseInstructor,
  type ReviewEdit,
  getCourseByCode,
  getOwnEditableReview,
  insertReview,
  listCourseInstructors,
  searchCoursesByText,
  updateOwnReview,
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
 * re-renders: `formError` for whole-form problems (unknown course), per-field
 * `errors` from the §4/§11 gate, or `authError` when the inline sign-in code
 * didn't exchange (issue #47) — shown by the code field, draft untouched.
 */
export interface ReviewFormState {
  formError?: string;
  errors?: ReviewFieldError[];
  authError?: ExchangeFailure;
}

/**
 * Submit a review (v1-spec §4/§11; issues #24/#47). This is the AUTHORITATIVE
 * gate: the form runs the same `validateReviewCore` live to keep Submit
 * disabled, but everything is re-checked here so a crafted POST can't bypass
 * the door. It also re-derives the selectable term window server-side, so a
 * stale client can't post an out-of-window term. On success it inserts the
 * review, revalidates the affected course page (§4's "revalidate the affected
 * course"), and redirects back to it.
 *
 * Auth is part of the same action (issue #47): a signed-in author is resolved
 * from the session; a signed-out one posts their Auburn email + sign-in code
 * along with the review, and the code is exchanged for a session HERE — after
 * the review has passed every check and right before the insert, so a
 * rejected draft never spends the code, and being signed in is a side effect
 * of posting. No navigation happens before the redirect to the course page.
 */
export async function submitReview(
  _prev: ReviewFormState,
  formData: FormData,
): Promise<ReviewFormState> {
  // 1. Auth, part one: a signed-in Auburn student resolves to the author token
  //    server-side (§7); it never reaches the client. A signed-out one is
  //    verified in step 4, once the review itself is known to be clean.
  let identityHash = await getCurrentIdentityHash();

  // 2. Resolve the course from the posted slug to its durable id (captured at
  //    write time, ADR 0001). A bad slug/unknown course is a whole-form error.
  const slug = String(formData.get("courseSlug") ?? "");
  const parsed = parseCourseSlug(slug);
  const course = parsed ? await getCourseByCode(parsed.subject, parsed.number) : null;
  if (!course) {
    return { formError: "That course could not be found." };
  }

  // 3. The door: re-derive the live window and run the full §4/§11 gate —
  //    the same pipeline an edit re-runs (issue #26).
  const selectableTermCodes = currentSelectableTerms().map((t) => t.code);
  const content = await parseReviewContent(formData, course.id, { selectableTermCodes });
  if ("errors" in content) return content;

  // 4. Auth, part two: a signed-out author proves mailbox control now, with the
  //    email + code posted alongside the review. The exchange (ADR 0003) is
  //    the same module `/signin` uses: it owns the domain gate, the Auth.js
  //    token hash, single use, and the attempt cap, and on success sets the
  //    session cookie on this very response. A failure returns the generic
  //    reason as state — the form and the draft stay exactly as typed. The
  //    address itself is never persisted: it is folded into `identity_hash`
  //    inside the exchange and discarded.
  if (!identityHash) {
    const result = await exchangeCodeForSession({
      email: String(formData.get("email") ?? ""),
      code: String(formData.get("code") ?? ""),
    });
    if (!result.ok) {
      return { authError: result.reason };
    }
    identityHash = result.identityHash;
  }

  await insertReview({
    courseId: course.id,
    identityHash,
    termCode: content.termCode,
    ...content.edit,
  });

  // 5. Revalidate what the new review changed (§4/§5/§8): the affected course
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

/**
 * Edit an existing review (v1-spec §11; issue #26). Re-runs the FULL submit
 * pipeline — every door-block, the instructor-taught-course check, the
 * optional-details sanitizing — so a bait-and-switch edit can't ride earned
 * trust past the filters. The course and term are fixed (they are what the
 * review *is*); the term is re-validated against itself rather than the
 * rolling window, since an old review's term may have aged out of what can be
 * newly submitted (§4: the window governs submission, never lifespan).
 * Helpful votes are kept and the review is stamped `edited` (updateOwnReview).
 * Authorization is the session → `identity_hash` → row ownership chain; a
 * review that isn't the caller's, or is no longer live, updates nothing.
 */
export async function updateReview(
  _prev: ReviewFormState,
  formData: FormData,
): Promise<ReviewFormState> {
  const identityHash = await getCurrentIdentityHash();
  if (!identityHash) {
    return { formError: "Sign in to edit your review." };
  }

  const reviewId = String(formData.get("reviewId") ?? "");
  if (!isUuid(reviewId)) {
    return { formError: "That review could not be found." };
  }
  const existing = await getOwnEditableReview(reviewId, identityHash);
  if (!existing) {
    return { formError: "That review could not be found or can no longer be edited." };
  }

  // The term is pinned to the stored one — the form posts it back as a hidden
  // field, and anything else is rejected by the gate.
  const content = await parseReviewContent(formData, existing.courseId, {
    selectableTermCodes: [existing.termCode],
  });
  if ("errors" in content) return content;

  const updated = await updateOwnReview(reviewId, identityHash, content.edit);
  if (!updated) {
    return { formError: "That review could not be found or can no longer be edited." };
  }

  const href = courseHref(existing.courseSubject, existing.courseNumber);
  revalidatePath(href);
  revalidatePath("/my");
  updateTag("reviews");
  redirect(href);
}

/**
 * The shared submit pipeline (issues #24/#26): parse the posted fields, run
 * the authoritative §4/§11 gate, confirm a chosen instructor actually taught
 * the course, and sanitize the optional "Course details". Returns either the
 * per-field errors to re-render, or the clean content both `insertReview` and
 * `updateOwnReview` write. Everything the door checks lives here so create
 * and edit can never drift apart.
 */
async function parseReviewContent(
  formData: FormData,
  courseId: string,
  { selectableTermCodes }: { selectableTermCodes: readonly string[] },
): Promise<{ errors: ReviewFieldError[] } | { termCode: string; edit: ReviewEdit }> {
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

  // Resolve the instructor choice into id XOR unknown-sentinel, and confirm a
  // real id actually taught this course (the dropdown was course-scoped, but
  // re-check so a forged id can't attach a review to an unrelated instructor).
  // `validateReviewCore` above already guaranteed a non-null choice.
  const choice = instructor!;
  let instructorId: string | null = null;
  let instructorUnknown: InstructorUnknown | null = null;
  if (choice.kind === "instructor") {
    const taught = await listCourseInstructors(courseId);
    if (!taught.some((i) => i.id === choice.id)) {
      return {
        errors: [{ field: "instructor", message: "Choose an instructor from the list." }],
      };
    }
    instructorId = choice.id;
  } else {
    instructorUnknown = choice.kind;
  }

  // Sanitize the optional "Course details" — kept only if recognized, never
  // blocking (§4). Multi-selects come through as repeated form fields.
  const languages = sanitizeMultiSelect(strList(formData.getAll("languages")), LANGUAGE_OPTIONS);
  const languagesOther = languages.includes("Other")
    ? str(formData.get("languagesOther"))?.slice(0, 60) ?? null
    : null;

  return {
    termCode: core.termCode!,
    edit: {
      instructorId,
      instructorUnknown,
      overall: core.overall!,
      difficulty: core.difficulty!,
      workloadHours: core.workloadHours!,
      body: core.body.trim(),
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
    },
  };
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
