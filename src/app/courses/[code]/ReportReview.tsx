"use client";

import { useId, useState, useTransition } from "react";
import { REPORT_DETAILS_MAX_LENGTH, REPORT_REASONS } from "@/domain";
import { reportReview } from "./report-actions";

// The per-review "Report" affordance (v1-spec §11.B; issue #27): a quiet link
// at the end of the helpful row that unfolds a small inline form — one reason
// from the guideline categories, optional details — and posts to the
// `reportReview` action. Bugs and feature requests are NOT this — they go to
// GitHub issues via the footer links.
export default function ReportReview({ reviewId }: { reviewId: string }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const id = useId();

  if (done) {
    return (
      <span className="report-done" role="status">
        Thanks — reported.
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        className="report-link"
        onClick={() => setOpen(true)}
      >
        Report
      </button>
    );
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await reportReview(reviewId, reason, details);
      if (result.ok) {
        setDone(true);
      } else if (result.error === "throttled") {
        setError("Too many reports from your connection right now — try again later.");
      } else if (result.error === "invalid") {
        setError(result.message);
      } else {
        setError("This review can't be reported — it may have been removed.");
      }
    });
  }

  return (
    <form
      className="report-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      aria-label="Report this review"
    >
      <label className="field-label" htmlFor={`${id}-reason`}>
        Report this review
      </label>
      <select
        id={`${id}-reason`}
        className="select-input"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        disabled={pending}
      >
        <option value="" disabled>
          Why?
        </option>
        {REPORT_REASONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <textarea
        className="textarea-input report-details"
        placeholder={
          reason === "other" ? "What's the problem?" : "Anything else? (optional)"
        }
        value={details}
        maxLength={REPORT_DETAILS_MAX_LENGTH}
        onChange={(e) => setDetails(e.target.value)}
        disabled={pending}
        aria-label="Details"
      />
      {error && <p className="field-error">{error}</p>}
      <div className="report-actions">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          Cancel
        </button>
        <button type="submit" className="btn-post" disabled={pending || !reason}>
          {pending ? "Sending…" : "Send report"}
        </button>
      </div>
    </form>
  );
}
