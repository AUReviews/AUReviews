"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { formatAverage, formatReviewCount, type SortDirection } from "@/lib/browse";
import {
  type CourseReview,
  type InstructorRow,
  type InstructorSort,
  type InstructorSortKey,
  type ReviewSortKey,
  formatReviewDate,
  formatReviewTerm,
  instructorLabel,
  reviewPills,
  sortCourseReviews,
  sortInstructorRows,
} from "@/lib/course-reviews";
import type { VoteDirection } from "@/domain";
import { castReviewVote } from "./vote-actions";

// The Reviews tab island (issue #25, §5). All rows arrive as props from the
// server render, so the full breakdown table and review list are in the
// static/ISR HTML; this island only re-orders and filters that same data, and
// runs the helpful-vote flow. Per-viewer vote state is fetched from the
// dynamic /api/votes route after mount — it can never bake into the shared
// CDN-static page (§8).

/** Post-vote reconciliation: the authoritative tallies + own-vote returned by
 * the server action, overriding the static render's counts for this session. */
interface VoteOverride {
  up: number;
  down: number;
  myVote: VoteDirection | null;
}

const REVIEW_SORTS: { key: ReviewSortKey; label: string }[] = [
  { key: "helpful", label: "Most helpful" },
  { key: "newest", label: "Newest" },
  { key: "term", label: "By term" },
];

export default function ReviewsSection({
  courseId,
  reviews,
  instructorRows,
}: {
  courseId: string;
  reviews: CourseReview[];
  instructorRows: InstructorRow[];
}) {
  const [reviewSort, setReviewSort] = useState<ReviewSortKey>("helpful");
  const [filter, setFilter] = useState<string | null>(null); // instructor id
  const [signedIn, setSignedIn] = useState<boolean | null>(null); // null = unknown
  const [myVotes, setMyVotes] = useState<Record<string, VoteDirection>>({});
  const [overrides, setOverrides] = useState<Record<string, VoteOverride>>({});

  // The viewer's own votes, from the dynamic per-user route (§8). Failure
  // (offline, signed out) just leaves the buttons unlit — votes still work
  // server-side, and the action re-checks auth anyway.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/votes?course=${courseId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setSignedIn(Boolean(data.signedIn));
        setMyVotes(data.votes ?? {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const visible = useMemo(() => {
    const filtered = filter
      ? reviews.filter((r) => r.instructorId === filter)
      : reviews;
    return sortCourseReviews(filtered, reviewSort);
  }, [reviews, filter, reviewSort]);

  // Filter tabs offer only instructors who actually have reviews — a tab that
  // filters to nothing helps no one. The breakdown table below still carries
  // every instructor who taught the course, including zero-review rows.
  const filterTabs = instructorRows.filter((r) => r.reviewCount > 0);

  return (
    <div className="panel-stack">
      <InstructorBreakdown rows={instructorRows} />

      <section>
        <div className="review-controls">
          {filterTabs.length > 0 && (
            <div className="itabs" role="group" aria-label="Filter by professor">
              <FilterTab
                label={`All (${reviews.length})`}
                active={filter === null}
                onClick={() => setFilter(null)}
              />
              {filterTabs.map((row) => (
                <FilterTab
                  key={row.id}
                  label={`${row.displayName} (${row.reviewCount})`}
                  active={filter === row.id}
                  onClick={() => setFilter(filter === row.id ? null : row.id)}
                />
              ))}
            </div>
          )}
          <label className="review-sort">
            Sort
            <select
              value={reviewSort}
              onChange={(e) => setReviewSort(e.target.value as ReviewSortKey)}
            >
              {REVIEW_SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="stack">
          {visible.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              signedIn={signedIn}
              myVote={overrides[review.id]?.myVote ?? myVotes[review.id] ?? null}
              override={overrides[review.id]}
              onVoted={(id, result) =>
                setOverrides((prev) => ({ ...prev, [id]: result }))
              }
            />
          ))}
          {visible.length === 0 && (
            <p className="muted">No reviews for this professor yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function FilterTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`itab${active ? " active" : ""}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

// The by-instructor breakdown (§5): one row per instructor who taught the
// course, in NEUTRAL default order (alphabetical — never ranked), each column
// user-sortable. Sorting here re-orders this table only; the course headline
// in the sidebar is fixed course-wide and never mutates (§5).
const BREAKDOWN_COLUMNS: { key: InstructorSortKey; label: string }[] = [
  { key: "overall", label: "Overall" },
  { key: "difficulty", label: "Difficulty" },
  { key: "workload", label: "Workload" },
  { key: "reviews", label: "Reviews" },
];

function InstructorBreakdown({ rows }: { rows: InstructorRow[] }) {
  const [sort, setSort] = useState<InstructorSort | null>(null);

  const sorted = useMemo(() => sortInstructorRows(rows, sort), [rows, sort]);
  if (rows.length === 0) return null;

  // First click sorts ascending (no "worst/hardest" opening framing, matching
  // the browse table); second flips; the neutral order is the pre-click state.
  function toggleSort(key: InstructorSortKey) {
    setSort((current) =>
      current?.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
  }

  return (
    <section>
      <strong className="subhead">By professor</strong>
      <div className="table">
        <div className="table-scroll">
          <table className="ctable">
            <thead>
              <tr>
                <th scope="col">
                  <span className="col-head static">Professor</span>
                </th>
                {BREAKDOWN_COLUMNS.map((col) => (
                  <BreakdownHeader
                    key={col.key}
                    columnKey={col.key}
                    label={col.label}
                    sort={sort}
                    onSort={toggleSort}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.id}>
                  <td className="title">{row.displayName}</td>
                  <BreakdownCell value={row.overall} count={row.reviewCount} />
                  <BreakdownCell value={row.difficulty} count={row.reviewCount} />
                  <BreakdownCell value={row.workload} count={row.reviewCount} />
                  <td className="numeric">{formatReviewCount(row.reviewCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function BreakdownHeader({
  columnKey,
  label,
  sort,
  onSort,
}: {
  columnKey: InstructorSortKey;
  label: string;
  sort: InstructorSort | null;
  onSort: (key: InstructorSortKey) => void;
}) {
  const active = sort?.key === columnKey;
  const ariaSort: "ascending" | "descending" | "none" = active
    ? sort.direction === "asc"
      ? "ascending"
      : "descending"
    : "none";
  const direction: SortDirection | null = active ? sort.direction : null;

  return (
    <th aria-sort={ariaSort} scope="col">
      <button
        type="button"
        className="col-head numeric"
        onClick={() => onSort(columnKey)}
      >
        {label}
        <span className="sort-caret" aria-hidden="true">
          {direction ? (direction === "asc" ? "▲" : "▼") : ""}
        </span>
      </button>
    </th>
  );
}

function BreakdownCell({ value, count }: { value: number | null; count: number }) {
  const text = formatAverage(value, count);
  return <td className={`numeric${text === "—" ? " muted" : ""}`}>{text}</td>;
}

// One review (§5/§13): its three numbers, professor, term, and date; the body;
// the optional-detail pills; and the helpful up/down votes.
function ReviewCard({
  review,
  signedIn,
  myVote,
  override,
  onVoted,
}: {
  review: CourseReview;
  signedIn: boolean | null;
  myVote: VoteDirection | null;
  override: VoteOverride | undefined;
  onVoted: (reviewId: string, result: VoteOverride) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [needsSignIn, setNeedsSignIn] = useState(false);

  const up = override?.up ?? review.helpfulUp;
  const down = override?.down ?? review.helpfulDown;
  const pills = reviewPills(review);

  // The client states the desired END state: clicking the lit direction
  // retracts, clicking the other flips (§5's retractable/flippable votes).
  function vote(direction: VoteDirection) {
    if (signedIn === false) {
      setNeedsSignIn(true);
      return;
    }
    const desired = myVote === direction ? null : direction;
    startTransition(async () => {
      const result = await castReviewVote(review.id, desired);
      if (result.ok) {
        onVoted(review.id, result);
      } else if (result.error === "signin") {
        setNeedsSignIn(true);
      }
    });
  }

  return (
    <article className="review">
      <div className="review-head">
        <span className="stat">
          Overall {review.overall} · Difficulty {review.difficulty} ·{" "}
          {review.workloadHours} hrs/wk
        </span>
        <span className="when">{formatReviewDate(review.createdAt)}</span>
      </div>
      <div className="review-meta">
        <span>{instructorLabel(review)}</span>
        <span className="review-term">{formatReviewTerm(review.termCode)}</span>
      </div>
      <p>{review.body}</p>
      {pills.length > 0 && (
        <span className="chips">
          {pills.map((pill) => (
            <span key={pill} className="chip">
              {pill}
            </span>
          ))}
        </span>
      )}
      <div className="helpful">
        <span className="helpful-label">Helpful?</span>
        <VoteButton
          direction="up"
          count={up}
          on={myVote === "up"}
          disabled={pending}
          onClick={() => vote("up")}
        />
        <VoteButton
          direction="down"
          count={down}
          on={myVote === "down"}
          disabled={pending}
          onClick={() => vote("down")}
        />
        {needsSignIn && (
          <span className="vote-signin">
            <Link href="/signin">Sign in</Link> with your Auburn email to vote.
          </span>
        )}
      </div>
    </article>
  );
}

const VOTE_ICON = (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
  </svg>
);

function VoteButton({
  direction,
  count,
  on,
  disabled,
  onClick,
}: {
  direction: VoteDirection;
  count: number;
  on: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`vote ${direction}${on ? " on" : ""}`}
      aria-pressed={on}
      aria-label={`${direction === "up" ? "Helpful" : "Not helpful"} (${count})`}
      disabled={disabled}
      onClick={onClick}
    >
      {VOTE_ICON}
      {count}
    </button>
  );
}
