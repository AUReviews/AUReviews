"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { contestMyRemoval, deleteMyReview } from "./actions";

// The per-review controls on My Activity (issue #26) — two small client
// islands on an otherwise server-rendered page. Both call a server action and
// then refresh the route so the server re-reads the author's rows; the page
// itself stays the source of truth for what state each review is in.

/** Edit link + two-step inline delete for a live review. The confirmation is
 * inline (no modal): the first press swaps the button for "Really delete?"
 * with a Yes/Keep pair, so a stray click never deletes. */
export function LiveReviewActions({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteMyReview(reviewId);
      if (result.ok) {
        router.refresh();
      } else if (result.error === "signin") {
        setError("Your session expired — sign in again to delete this review.");
      } else {
        setError("This review can't be deleted right now.");
      }
    });
  }

  return (
    <div className="my-actions">
      <Link href={`/reviews/${reviewId}/edit`} className="btn-ghost my-btn">
        Edit
      </Link>
      {confirming ? (
        <span className="my-confirm" role="group" aria-label="Confirm delete">
          <span>Really delete?</span>
          <button
            type="button"
            className="btn-ghost my-btn danger"
            disabled={pending}
            onClick={confirmDelete}
          >
            {pending ? "Deleting…" : "Yes, delete"}
          </button>
          <button
            type="button"
            className="btn-ghost my-btn"
            disabled={pending}
            onClick={() => setConfirming(false)}
          >
            Keep
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="btn-ghost my-btn"
          onClick={() => setConfirming(true)}
        >
          Delete
        </button>
      )}
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

/** "Contest this removal" (§11): one press sets `contested=true`; the page
 * then shows the contested state and the button is gone. */
export function ContestRemoval({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function contest() {
    setError(null);
    startTransition(async () => {
      const result = await contestMyRemoval(reviewId);
      if (result.ok) {
        router.refresh();
      } else if (result.error === "signin") {
        setError("Your session expired — sign in again to contest this removal.");
      } else {
        setError("This removal can't be contested right now.");
      }
    });
  }

  return (
    <div className="my-actions">
      <button
        type="button"
        className="btn-ghost my-btn"
        disabled={pending}
        onClick={contest}
      >
        {pending ? "Sending…" : "Contest this removal"}
      </button>
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
