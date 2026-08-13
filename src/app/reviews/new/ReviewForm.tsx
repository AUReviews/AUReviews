"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
// Imported from the deep `@/domain/review` path, NOT the `@/domain` barrel, on
// purpose: the barrel re-exports `anonymity.ts`, which pulls in `node:crypto`
// and can't be bundled into this client component. `review.ts` is pure and
// browser-safe, so the client and the server action share the exact same gate.
import {
  ATTENDANCE_OPTIONS,
  BODY_MIN_LENGTH,
  CURVED_OPTIONS,
  GRADE_OPTIONS,
  LANGUAGE_OPTIONS,
  PREP_OPTIONS,
  type ReviewFieldError,
  WORKLOAD_SHAPE_OPTIONS,
  parseInstructorChoice,
  validateReviewCore,
} from "@/domain/review";
import {
  type CourseOption,
  normalizeCourseSearchQuery,
} from "@/lib/course-search";
import {
  type ReviewFormState,
  listInstructorOptions,
  searchCourseOptions,
  submitReview,
} from "./actions";

// The review submission form (v1-spec §4/§11/§13; issues #24/#40) — the one
// client island. It renders the course picker, the required core, the
// collapsible optional "Course details" zone, the inline Review Guidelines
// panel, and the assent line. Its defining behavior is the LIVE door: every
// keystroke re-runs the SAME `validateReviewCore` the server action re-runs
// authoritatively, so Submit is disabled — never merely error-on-click — until
// the submission is clean (§11.A: "before Submit is clickable, never after").
// The optional zone is uncontrolled and never feeds the gate, so nothing in it
// can block submission (§4).
//
// The course is data on the review, not a location (issue #40): arriving with
// a prefill (`?course=`) and picking a course in the form converge on the same
// selected `CourseOption`, post the same slug, and land on the same course
// page. "change" simply drops back to the search.

// Structurally the db layer's `CourseInstructor`, redeclared on purpose: this
// client island imports only pure, browser-safe modules, and a value import of
// `@/db/queries` (drizzle + the Neon client) must never be one bundler slip
// away. The submit action re-checks instructor-taught-course anyway.
export interface InstructorOption {
  id: string;
  displayName: string;
}

/** The server-resolved `?course=` prefill: the course plus its scoped dropdown. */
export interface ReviewFormPrefill {
  course: CourseOption;
  instructors: InstructorOption[];
}

export interface ReviewFormProps {
  prefill: ReviewFormPrefill | null;
  terms: { code: string; label: string }[];
  signedIn: boolean;
  signInHref: string;
}

const RATING_VALUES = [1, 2, 3, 4, 5];

// Long enough to coalesce a fast typist's keystrokes into one search action,
// short enough that results still feel live.
const SEARCH_DEBOUNCE_MS = 200;

export default function ReviewForm({
  prefill,
  terms,
  signedIn,
  signInHref,
}: ReviewFormProps) {
  // The selectable window is exactly the terms offered; derive it here rather
  // than passing the same list twice from the server.
  const selectableTermCodes = useMemo(() => terms.map((t) => t.code), [terms]);
  const [state, formAction, pending] = useActionState<ReviewFormState, FormData>(
    submitReview,
    {},
  );

  // The selected course and its scoped instructor list move together: a pick
  // loads the dropdown for that course, a "change" clears both, so the
  // dropdown can never show people from a previously selected course.
  const [course, setCourse] = useState<CourseOption | null>(
    prefill?.course ?? null,
  );
  const [instructors, setInstructors] = useState<InstructorOption[]>(
    prefill?.instructors ?? [],
  );
  const [instructorsLoading, setInstructorsLoading] = useState(false);

  // Required-core state — the only inputs the live gate reads.
  const [overall, setOverall] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [workload, setWorkload] = useState("");
  const [termCode, setTermCode] = useState("");
  const [instructor, setInstructor] = useState("");
  const [body, setBody] = useState("");

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [guidelinesOpen, setGuidelinesOpen] = useState(false);

  // Surface a field's error only once the user has engaged it, so the form
  // doesn't open shouting. Once engaged, the LIVE result governs — so a field
  // the user has since corrected stops showing its message immediately, and a
  // stale server error from an earlier bounce can't linger past the fix. A
  // server error still shows for a field the user hasn't touched yet.
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Monotonic token so only the LATEST instructor load may land: a slow
  // response for a since-changed course is dropped, never shown.
  const instructorLoadToken = useRef(0);

  const selectCourse = (option: CourseOption) => {
    setCourse(option);
    // The old selection (and any shown error) is meaningless for the new
    // course's list, so reset the field to untouched.
    setInstructor("");
    setTouched((t) => ({ ...t, instructor: false }));
    setInstructors([]);
    setInstructorsLoading(true);
    const token = ++instructorLoadToken.current;
    void listInstructorOptions(option.id)
      .then((list) => {
        if (instructorLoadToken.current !== token) return;
        setInstructors(list);
        setInstructorsLoading(false);
      })
      // A failed load must not strand the dropdown on "Loading…": fall back to
      // the two unknown escapes alone, the same state as a course with no
      // ingested offering history.
      .catch(() => {
        if (instructorLoadToken.current !== token) return;
        setInstructorsLoading(false);
      });
  };

  const clearCourse = () => {
    instructorLoadToken.current++;
    setCourse(null);
    setInstructor("");
    setTouched((t) => ({ ...t, instructor: false }));
    setInstructors([]);
    setInstructorsLoading(false);
  };

  // The live gate: exactly what the server re-checks (§11.A). Recomputed every
  // render from the controlled core, so the messages and the disabled Submit
  // always reflect the current input.
  const liveErrors = useMemo(
    () =>
      validateReviewCore(
        {
          overall,
          difficulty,
          workloadHours: workload.trim() === "" ? null : Number(workload),
          termCode: termCode || null,
          instructor: parseInstructorChoice(instructor),
          body,
        },
        { selectableTermCodes },
      ),
    [overall, difficulty, workload, termCode, instructor, body, selectableTermCodes],
  );

  const serverErrors = state.errors ?? [];
  const errorFor = (field: ReviewFieldError["field"]): string | null => {
    if (touched[field]) {
      return liveErrors.find((e) => e.field === field)?.message ?? null;
    }
    return serverErrors.find((e) => e.field === field)?.message ?? null;
  };

  const bodyLength = body.trim().length;
  // A course is part of the door too: the core gate doesn't know about it, so
  // Submit stays disabled until one is selected (the action re-resolves it).
  const canSubmit =
    signedIn && course !== null && liveErrors.length === 0 && !pending;
  const cancelHref = course ? `/courses/${course.slug}` : "/courses";

  return (
    <form action={formAction} className="add-card" noValidate>
      <input type="hidden" name="courseSlug" value={course?.slug ?? ""} />
      <input type="hidden" name="overall" value={overall ?? ""} />
      <input type="hidden" name="difficulty" value={difficulty ?? ""} />

      <div>
        <h1>Add a review</h1>
        <p className="lede">
          Anonymous. Your Auburn email verifies you and is never stored with the review.
        </p>
      </div>

      <div className="frow">
        <div style={{ flex: 2 }}>
          <div className="field-label">Course</div>
          {course ? (
            <div className="fake-input between">
              <span>{course.label}</span>
              <button type="button" className="change" onClick={clearCourse}>
                change
              </button>
            </div>
          ) : (
            <CourseSearch onSelect={selectCourse} />
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div className="field-label">Term</div>
          <select
            name="termCode"
            className="select-input"
            value={termCode}
            onChange={(e) => setTermCode(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, termCode: true }))}
          >
            <option value="">Select…</option>
            {terms.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
          <FieldError message={errorFor("termCode")} />
        </div>
      </div>

      <div className="frow">
        <div style={{ flex: 1 }}>
          <div className="field-label">Overall rating</div>
          <Scale
            label="Overall rating"
            lowLabel="poor"
            highLabel="great"
            value={overall}
            onPick={(v) => {
              setOverall(v);
              setTouched((t) => ({ ...t, overall: true }));
            }}
          />
          <FieldError message={errorFor("overall")} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="field-label">Difficulty</div>
          <Scale
            label="Difficulty"
            lowLabel="very easy"
            highLabel="very hard"
            value={difficulty}
            onPick={(v) => {
              setDifficulty(v);
              setTouched((t) => ({ ...t, difficulty: true }));
            }}
          />
          <FieldError message={errorFor("difficulty")} />
        </div>
      </div>

      <div className="frow">
        <div style={{ flex: 1 }}>
          <div className="field-label">Hours per week (outside lecture)</div>
          <input
            name="workloadHours"
            type="number"
            inputMode="numeric"
            min={1}
            max={40}
            step={1}
            className="num-input"
            placeholder="e.g. 10"
            value={workload}
            onChange={(e) => {
              setWorkload(e.target.value);
              setTouched((t) => ({ ...t, workloadHours: true }));
            }}
          />
          <FieldError message={errorFor("workloadHours")} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="field-label">Instructor</div>
          <select
            name="instructor"
            className="select-input"
            value={instructor}
            disabled={!course}
            onChange={(e) => setInstructor(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, instructor: true }))}
          >
            <option value="">
              {course
                ? instructorsLoading
                  ? "Loading…"
                  : "Select…"
                : "Select a course first"}
            </option>
            {instructors.map((i) => (
              <option key={i.id} value={i.id}>
                {i.displayName}
              </option>
            ))}
            <option value="not-listed">Instructor not listed</option>
            <option value="dont-remember">Don&apos;t remember</option>
          </select>
          <FieldError message={errorFor("instructor")} />
        </div>
      </div>

      <div>
        <div className="field-label">Your review</div>
        <textarea
          name="body"
          className="textarea-input"
          placeholder="What surprised you? How would you prepare? What was the workload actually like week to week?"
          value={body}
          // Mark touched on the first keystroke, not on blur, so the door-block
          // reason (link/contact/slur/too-short) shows live as the user types —
          // §11's "live, before Submit is clickable," not a blur-gated reveal.
          onChange={(e) => {
            setBody(e.target.value);
            setTouched((t) => ({ ...t, body: true }));
          }}
        />
        <div className="body-foot">
          <span className={bodyLength < BODY_MIN_LENGTH ? "counter under" : "counter ok"}>
            {bodyLength}/{BODY_MIN_LENGTH} min
          </span>
        </div>
        <FieldError message={errorFor("body")} />
      </div>

      <OptionalDetails
        open={detailsOpen}
        onToggle={() => setDetailsOpen((v) => !v)}
      />

      <GuidelinesPanel
        open={guidelinesOpen}
        onToggle={() => setGuidelinesOpen((v) => !v)}
      />

      {state.formError && (
        <p role="alert" className="form-error">
          {state.formError}
        </p>
      )}

      {signedIn ? (
        <>
          {/* The §13 ToS/Privacy/18+ assent line. Terms and Privacy are named
              in plain text, not linked, until the legal pages ship (a separate
              §13 ticket) — a live link to a 404 is worse than none. */}
          <p className="assent">
            By posting you agree to our Terms and Privacy Policy, and confirm you are 18 or older.
          </p>
          <div className="add-actions">
            <Link href={cancelHref} className="btn-ghost">
              Cancel
            </Link>
            <button type="submit" className="btn-post" disabled={!canSubmit}>
              {pending ? "Posting…" : "Post anonymously"}
            </button>
          </div>
        </>
      ) : (
        <div className="auth">
          <strong>Sign in to post</strong>
          <span className="note">
            Only verified Auburn students can leave reviews. Verify your Auburn email, then come
            back to this page to post.
          </span>
          <Link href={signInHref} className="btn-post" style={{ alignSelf: "flex-start" }}>
            Sign in with your Auburn email
          </Link>
        </div>
      )}
    </form>
  );
}

// The server-backed course typeahead (issue #40): the user types a code or
// title fragment, the `searchCourseOptions` action returns a handful of
// matches, and picking one hands the option up to the form. Debounced so a
// fast typist doesn't fire an action per keystroke, and each response is
// dropped unless it answers the CURRENT query, so a slow early response can't
// overwrite a later one.
function CourseSearch({ onSelect }: { onSelect: (option: CourseOption) => void }) {
  const [query, setQuery] = useState("");
  // Responses are stored WITH the query they answered; the render below only
  // shows hits that answer the current query, so staleness is filtered at
  // render time rather than by resetting state in the effect.
  const [hits, setHits] = useState<{
    query: string;
    options: CourseOption[];
  } | null>(null);

  // The server's own minimum-query rule, so we never fire an action it would
  // answer with nothing anyway.
  const searchable = normalizeCourseSearchQuery(query) !== null;

  useEffect(() => {
    if (!searchable) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      // A failed search reads as "no results yet" (hits stay stale/absent);
      // the next keystroke retries, so there is no stuck state to surface.
      void searchCourseOptions(query)
        .then((options) => {
          if (!cancelled) setHits({ query, options });
        })
        .catch(() => {});
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, searchable]);

  const current = searchable && hits?.query === query ? hits : null;
  const results = current?.options ?? [];

  return (
    <div className="course-search">
      <input
        type="text"
        className="num-input"
        placeholder="Search by code or title, e.g. COMP 3270"
        value={query}
        aria-label="Search for a course"
        autoComplete="off"
        onChange={(e) => setQuery(e.target.value)}
      />
      {results.length > 0 && (
        <ul className="course-search-results">
          {results.map((option) => (
            <li key={option.id}>
              <button type="button" onClick={() => onSelect(option)}>
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {current !== null && results.length === 0 && (
        <p className="course-search-empty">No matching courses.</p>
      )}
    </div>
  );
}

// A 1–5 segmented scale (prototype `.scale`). The picked value rides in a hidden
// input the parent renders, so the button group posts like a native control.
// `lowLabel`/`highLabel` are the §4 anchor captions (1 = "very easy" … 5 = "very
// hard") that make a rating mean the same thing to everyone; each button also
// gets a spoken "N — label" so a screen reader announces the anchors too.
function Scale({
  label,
  lowLabel,
  highLabel,
  value,
  onPick,
}: {
  label: string;
  lowLabel: string;
  highLabel: string;
  value: number | null;
  onPick: (v: number) => void;
}) {
  const anchorFor = (v: number): string | undefined =>
    v === 1 ? lowLabel : v === RATING_VALUES.length ? highLabel : undefined;

  return (
    <>
      <div className="scale" role="radiogroup" aria-label={label}>
        {RATING_VALUES.map((v) => {
          const anchor = anchorFor(v);
          return (
            <button
              type="button"
              key={v}
              role="radio"
              aria-checked={value === v}
              aria-label={anchor ? `${v} — ${anchor}` : String(v)}
              className={value === v ? "sel" : undefined}
              onClick={() => onPick(v)}
            >
              {v}
            </button>
          );
        })}
      </div>
      <div className="scale-anchors" aria-hidden="true">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </>
  );
}

// The optional "Course details" zone (§4) — collapsed by default, entirely
// uncontrolled: it never feeds the live gate, so nothing here can block Submit.
function OptionalDetails({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="details">
      <button type="button" className="details-toggle" onClick={onToggle} aria-expanded={open}>
        Course details (optional) {open ? "▴" : "▾"}
      </button>
      {open && (
        <div className="details-body">
          <CheckGroup label="Workload shape" name="workloadShape" options={WORKLOAD_SHAPE_OPTIONS} />
          <div className="frow">
            <SelectField label="Grade" name="grade" options={GRADE_OPTIONS} />
            <SelectField label="Curved" name="curved" options={CURVED_OPTIONS} />
          </div>
          <div className="frow">
            <SelectField label="Attendance" name="attendance" options={ATTENDANCE_OPTIONS} />
            <SelectField label="Preparation" name="prep" options={PREP_OPTIONS} />
          </div>
          <CheckGroup label="Languages" name="languages" options={LANGUAGE_OPTIONS} />
          <div>
            <div className="field-label">Other language</div>
            <input
              name="languagesOther"
              type="text"
              className="num-input"
              maxLength={60}
              placeholder="Only if you picked “Other” above"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function CheckGroup({
  label,
  name,
  options,
}: {
  label: string;
  name: string;
  options: readonly string[];
}) {
  return (
    <div>
      <div className="field-label">{label}</div>
      <div className="check-group">
        {options.map((opt) => (
          <label key={opt} className="check-chip">
            <input type="checkbox" name={name} value={opt} />
            {opt}
          </label>
        ))}
      </div>
    </div>
  );
}

function SelectField({
  label,
  name,
  options,
}: {
  label: string;
  name: string;
  options: readonly string[];
}) {
  return (
    <div style={{ flex: 1 }}>
      <div className="field-label">{label}</div>
      <select name={name} className="select-input" defaultValue="">
        <option value="">—</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

// The inline Review Guidelines panel (§11/§13) — shown at authoring time so the
// prohibited categories are visible before posting, not just enforced after.
function GuidelinesPanel({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="details">
      <button type="button" className="details-toggle" onClick={onToggle} aria-expanded={open}>
        Review guidelines {open ? "▴" : "▾"}
      </button>
      {open && (
        <div className="guidelines">
          <p>Reviews cover the course and its instructor of record. Please don’t post:</p>
          <ul>
            <li>Named accusations of misconduct or illegal activity.</li>
            <li>Comments on a protected characteristic or someone’s appearance.</li>
            <li>Identifying or contact information, links, emails, or phone numbers.</li>
            <li>Content about TAs or other students, or profanity.</li>
            <li>Off-topic, wrong-course, spam, impersonation, or self-review content.</li>
          </ul>
          <p className="muted">
            Links, contact details, slurs, and reviews under {BODY_MIN_LENGTH} characters are
            blocked automatically; everything else is handled if it’s reported.
          </p>
        </div>
      )}
    </div>
  );
}

function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="field-error" role="alert">
      {message}
    </p>
  );
}
