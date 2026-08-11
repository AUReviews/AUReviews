import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { getCourseByCode, listCourses, listPrereqRows } from "@/db/queries";
import {
  type CourseDetail,
  courseSlug,
  formatCatalogYear,
  formatCourseCode,
  formatCourseDescription,
  formatCreditHours,
  parseCourseSlug,
  reviewFormHref,
} from "@/lib/course-detail";
import {
  type CoursePrereqView,
  type PrereqCatalogRow,
  type PrereqChipView,
  type RequirementView,
  type UnlockChipView,
  buildCoursePrereqView,
} from "@/lib/prereqs";
import CourseTabs from "./CourseTabs";

// Course detail page — the catalog side (issue #21, v1-spec §6/§13). One page per
// Course that stands alone before any review exists: the full catalog record
// (title, COMP code, credit hours, description, verbatim prereq prose, and a
// catalog-year stamp) plus a clear path to write the first review.
//
// ISR: CDN-static with a time-based fallback, refreshable on demand via the
// "catalog" cache tag after an import (§8). When reviews land (#6), a per-course
// revalidatePath on write will refresh a single course page without an import.
export const revalidate = 3600;

// Behind the "catalog" tag so a catalog import (#18) refreshes every course page
// on demand. The (subject, number) arguments are part of unstable_cache's key,
// so each course caches independently under the shared tag.
const loadCourse = unstable_cache(
  (subject: string, number: string): Promise<CourseDetail | null> =>
    getCourseByCode(subject, number),
  ["course-detail"],
  { tags: ["catalog"] },
);

// The whole-catalog prereq snapshot the Prerequisites/Unlocks graph is derived
// from (issue #22). Shared across every course page and behind the same "catalog"
// tag, so one import refreshes all prereq chips. Keyed with no arguments — it's
// the same snapshot for every course; the per-course slice happens in-process via
// buildCoursePrereqView.
const loadPrereqRows = unstable_cache(
  (): Promise<PrereqCatalogRow[]> => listPrereqRows(),
  ["course-prereq-rows"],
  { tags: ["catalog"] },
);

// Prerender every course page at build so the catalog is CDN-static from the
// first request (§8). Unknown/new slugs still render on-demand (dynamicParams
// defaults to true) and are cached under the same ISR window. If the DB is not
// reachable at build — e.g. before Neon is provisioned — this falls back to no
// prerendered pages and pure on-demand ISR, exactly as the /courses index does.
export async function generateStaticParams(): Promise<{ code: string }[]> {
  try {
    const courses = await listCourses();
    return courses.map((c) => ({ code: courseSlug(c.subject, c.number) }));
  } catch {
    return [];
  }
}

/** Resolve a `[code]` slug to a course, or `null` for a bad/unknown slug. */
async function resolveCourse(code: string): Promise<CourseDetail | null> {
  const parsed = parseCourseSlug(code);
  if (!parsed) return null;
  return loadCourse(parsed.subject, parsed.number);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const course = await resolveCourse(code);
  if (!course) return { title: "Course not found — AUReviews" };

  const codeLabel = formatCourseCode(course.subject, course.number);
  return {
    title: `${codeLabel} ${course.title} — AUReviews`,
    description:
      formatCourseDescription(course.description) ??
      `Reviews and catalog details for ${codeLabel} ${course.title} at Auburn.`,
  };
}

export default async function CoursePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const course = await resolveCourse(code);
  if (!course) notFound();

  const codeLabel = formatCourseCode(course.subject, course.number);
  const credits = formatCreditHours(course.creditHours);
  const reviewHref = reviewFormHref(course.subject, course.number);

  // Prerequisites + the inverse "Unlocks", derived from the whole-catalog
  // snapshot so both directions stay consistent (issue #22, §6).
  const prereqView = buildCoursePrereqView(
    {
      subject: course.subject,
      number: course.number,
      prereqText: course.prereqText,
    },
    await loadPrereqRows(),
  );

  return (
    <div className="course">
      <div className="course-head">
        <h1>
          {codeLabel} · {course.title}
        </h1>
        <div className="course-meta">
          {credits && <span>{credits}</span>}
          <span className="catalog-stamp">
            {formatCatalogYear(course.catalogYear)}
          </span>
          {course.status === "retired" && (
            <span className="retired-tag">retired</span>
          )}
        </div>
        {course.status === "retired" && (
          <p className="retired-note">
            No longer in the active Auburn catalog. Its page and reviews are kept.
          </p>
        )}
      </div>

      <div className="course-body">
        <div className="course-main">
          <CourseTabs
            reviewCount={course.reviewCount}
            overview={
              <Overview
                course={course}
                prereqView={prereqView}
                reviewHref={reviewHref}
              />
            }
            reviews={<ReviewsPanel course={course} reviewHref={reviewHref} />}
          />
        </div>

        <aside className="side">
          <Link href={reviewHref} className="btn-accent btn-block">
            Review this course
          </Link>
          <div className="stats">
            <StatRow label="Overall" unit="/5" />
            <StatRow label="Difficulty" unit="/5" />
            <StatRow label="Workload" unit="hrs" />
            <p className="stats-note">
              No reviews yet — averages appear once a course has two or more.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

// The Overview tab: the full standalone catalog record (issue #21). Every field
// is verbatim from the last import; the prereq block now renders parsed
// Prerequisites/Unlocks chips (issue #22, §6), falling back to verbatim prose
// wherever the parse can't confidently structure a clause. When N = 0 the "No
// reviews — write one" CTA is shown here too — Overview is the default tab, so
// §5's "the catalog page stands alone with the CTA" holds without the reader
// first clicking into Reviews.
function Overview({
  course,
  prereqView,
  reviewHref,
}: {
  course: CourseDetail;
  prereqView: CoursePrereqView;
  reviewHref: string;
}) {
  // The stored description is the lossless bulletin body; strip the LEC./LAB.
  // breakdown and the Pr./Coreq. prose now that credits and prerequisites are
  // shown structurally (issue #22).
  const description = formatCourseDescription(course.description);

  return (
    <div className="panel-stack">
      <section className="desc-card">
        <strong className="subhead">Description</strong>
        {description ? (
          <p>{description}</p>
        ) : (
          <p className="muted">No catalog description on file.</p>
        )}
      </section>

      <PrerequisitesCard view={prereqView} />
      <UnlocksCard unlocks={prereqView.unlocks} />

      {course.reviewCount === 0 && (
        <NoReviewsCta course={course} reviewHref={reviewHref} />
      )}
    </div>
  );
}

// Prerequisites (issue #22): the parsed requirement groups as clickable course
// chips, verbatim prose wherever a clause couldn't be structured. Corequisites
// share the parser and render under their own label. Nothing is ever dropped —
// an unparseable clause shows its original text (§6).
function PrerequisitesCard({ view }: { view: CoursePrereqView }) {
  const prereqs = view.requirements.filter((r) => r.relation === "prerequisite");
  const coreqs = view.requirements.filter((r) => r.relation === "corequisite");

  return (
    <section className="desc-card">
      <strong className="subhead">Prerequisites</strong>
      {view.rawFallback ? (
        <p>{view.rawFallback}</p>
      ) : prereqs.length > 0 ? (
        <RequirementList requirements={prereqs} />
      ) : (
        <p className="muted">No prerequisites listed.</p>
      )}

      {coreqs.length > 0 && (
        <div className="req-coreq">
          <strong className="subhead">
            Corequisite{coreqs.length > 1 ? "s" : ""}
          </strong>
          <RequirementList requirements={coreqs} />
        </div>
      )}
    </section>
  );
}

// A conjunction of requirement groups (each group all-required); a group with
// more than one course is a "one of" disjunction. Renders top-to-bottom so the
// stacked rows read as the AND they are.
function RequirementList({
  requirements,
}: {
  requirements: RequirementView[];
}) {
  return (
    <div className="req-list">
      {requirements.map((req, i) =>
        req.fallback ? (
          <p key={i} className="req-fallback">
            {req.fallback}
          </p>
        ) : (
          <div key={i} className="req-groups">
            {req.groups.map((group, g) => (
              <div key={g} className="req-group">
                {group.chips.length > 1 && (
                  <span className="req-conj">one of</span>
                )}
                <span className="chips">
                  {group.chips.map((chip) => (
                    <CourseChip key={chip.code} chip={chip} />
                  ))}
                </span>
              </div>
            ))}
          </div>
        ),
      )}
    </div>
  );
}

// A single prerequisite chip. Links to the referenced course when we carry it in
// the catalog; a cross-department reference we don't carry (e.g. ELEC 2220) stays
// an unlinked chip rather than a dead link. A grade threshold rides along as a
// small suffix.
function CourseChip({ chip }: { chip: PrereqChipView }) {
  const label = (
    <>
      {chip.code}
      {chip.grade && <small className="chip-grade">min {chip.grade}</small>}
    </>
  );
  return chip.href ? (
    <Link href={chip.href} className="chip chip-link">
      {label}
    </Link>
  ) : (
    <span className="chip">{label}</span>
  );
}

// Unlocks (issue #22): the inverse of Prerequisites — the courses that require
// this one. Every entry is a course we carry, so every chip links. Omitted
// entirely when this course unlocks nothing.
function UnlocksCard({ unlocks }: { unlocks: UnlockChipView[] }) {
  if (unlocks.length === 0) return null;
  return (
    <section className="desc-card">
      <strong className="subhead">Unlocks</strong>
      <span className="chips">
        {unlocks.map((course) => (
          <Link
            key={course.code}
            href={course.href}
            className="chip chip-link"
            title={course.title}
          >
            {course.code}
          </Link>
        ))}
      </span>
    </section>
  );
}

// The Reviews tab scaffold (issue #21): the review list is a later ticket (#6),
// so with N = 0 this is the "No reviews — write one" CTA into the review form
// (§5's zero-review state). When reviews land this panel renders the list.
function ReviewsPanel({
  course,
  reviewHref,
}: {
  course: CourseDetail;
  reviewHref: string;
}) {
  if (course.reviewCount === 0) {
    return <NoReviewsCta course={course} reviewHref={reviewHref} />;
  }
  // Review list rendering arrives with #6; the catalog-side ticket only needs the
  // scaffold and the zero-review CTA above.
  return null;
}

// §5's N = 0 state: "the catalog page still stands alone with a 'No reviews —
// write one' CTA linking straight into the review form." Shared by both the
// Overview (default) and Reviews tabs so a first visitor always meets it.
function NoReviewsCta({
  course,
  reviewHref,
}: {
  course: CourseDetail;
  reviewHref: string;
}) {
  return (
    <div className="no-reviews">
      <strong>No reviews yet — write one</strong>
      <p>
        Be the first to review {formatCourseCode(course.subject, course.number)}.
        Your Auburn email verifies you and is never stored with the review.
      </p>
      <Link href={reviewHref} className="btn-accent">
        Write the first review
      </Link>
    </div>
  );
}

function StatRow({ label, unit }: { label: string; unit: string }) {
  // N = 0 everywhere in v1 → the low-data rule (§5) shows "—", never a headline
  // average built from too little data.
  return (
    <div className="stat-row">
      <span className="lbl">{label}</span>
      <strong className="val muted">
        —<small> {unit}</small>
      </strong>
    </div>
  );
}
