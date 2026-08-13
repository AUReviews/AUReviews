"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  type BrowseCourse,
  type SortDirection,
  type SortKey,
  DEFAULT_SORT,
  formatAverage,
  formatReviewCount,
  sortBrowseCourses,
} from "@/lib/browse";
import { courseHref, formatCourseCode } from "@/lib/course-detail";

// The click-to-sort catalog table (issue #20, §5). The full row set is rendered
// server-side in catalog order (so the static/ISR HTML is already correct and
// works with JS off); this island only re-orders that same set in the browser
// when a header is clicked — no network round trip, no leaderboard default.

interface Column {
  key: SortKey;
  label: string;
  numeric: boolean;
}

// Header order is the spec's: Course · Code · Overall · Difficulty · Workload ·
// Reviews (N). "Course" sorts on the title, "Code" on the COMP number.
const COLUMNS: Column[] = [
  { key: "title", label: "Course", numeric: false },
  { key: "code", label: "Code", numeric: false },
  { key: "overall", label: "Overall", numeric: true },
  { key: "difficulty", label: "Difficulty", numeric: true },
  { key: "workload", label: "Workload", numeric: true },
  { key: "reviews", label: "Reviews", numeric: true },
];

export default function CourseTable({ courses }: { courses: BrowseCourse[] }) {
  const [sort, setSort] = useState(DEFAULT_SORT);

  const sorted = useMemo(
    () => sortBrowseCourses(courses, sort.key, sort.direction),
    [courses, sort],
  );

  // Click a new column → sort it ascending; click the active column → flip
  // direction. First-click is always ascending for every column, so no column
  // opens on a "worst/hardest" framing (§5).
  function toggleSort(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
  }

  return (
    <div className="table">
      <div className="table-scroll">
        <table className="ctable">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <ColumnHeader
                  key={col.key}
                  column={col}
                  sort={sort}
                  onSort={toggleSort}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((course) => (
              <tr
                key={course.id}
                className={`course-row${course.status === "retired" ? " retired" : ""}`}
              >
                <td className="title">
                  <Link
                    href={courseHref(course.subject, course.number)}
                    className="course-link"
                  >
                    {course.title}
                  </Link>
                </td>
                <td className="code">
                  {formatCourseCode(course.subject, course.number)}
                  {course.status === "retired" && (
                    <span className="retired-tag">retired</span>
                  )}
                </td>
                <RatingCell value={course.overall} />
                <RatingCell value={course.difficulty} />
                <RatingCell value={course.workload} />
                <td className="numeric">{formatReviewCount(course.reviewCount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ColumnHeader({
  column,
  sort,
  onSort,
}: {
  column: Column;
  sort: { key: SortKey; direction: SortDirection };
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === column.key;
  const ariaSort = active
    ? sort.direction === "asc"
      ? "ascending"
      : "descending"
    : "none";

  return (
    <th aria-sort={ariaSort} scope="col">
      <button
        type="button"
        className={`col-head${column.numeric ? " numeric" : ""}`}
        onClick={() => onSort(column.key)}
      >
        {column.label}
        <span className="sort-caret" aria-hidden="true">
          {active ? (sort.direction === "asc" ? "▲" : "▼") : ""}
        </span>
      </button>
    </th>
  );
}

function RatingCell({ value }: { value: number | null }) {
  const text = formatAverage(value);
  return <td className={`numeric${text === "—" ? " muted" : ""}`}>{text}</td>;
}
