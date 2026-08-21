"use client";

import { useActionState } from "react";
import { CONCERN_KINDS, CONCERN_MESSAGE_MAX_LENGTH } from "@/domain";
import { type ConcernFormState, submitConcern } from "./actions";

const IDLE: ConcernFormState = { status: "idle" };

// The concern form island (issue #27). Plain native controls in the sign-in
// card language; the server action is the authoritative validator and hands
// back the one field to fix. On success the form is replaced by a thank-you.
export function ConcernForm() {
  const [state, action, pending] = useActionState(submitConcern, IDLE);

  if (state.status === "sent") {
    return (
      <p className="form-ok" role="status">
        Thanks — your concern was sent. If you left an email, you may hear back.
      </p>
    );
  }

  const error = state.status === "error" ? state : null;

  return (
    <form action={action} className="signin-form" noValidate>
      <div>
        <label className="field-label" htmlFor="concern-kind">
          What is this about?
        </label>
        <select id="concern-kind" name="kind" className="select-input" defaultValue="" required>
          <option value="" disabled>
            Choose one…
          </option>
          {CONCERN_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        {error?.field === "kind" && <p className="field-error">{error.message}</p>}
      </div>

      <div>
        <label className="field-label" htmlFor="concern-message">
          What happened?
        </label>
        <textarea
          id="concern-message"
          name="message"
          className="textarea-input"
          maxLength={CONCERN_MESSAGE_MAX_LENGTH}
          placeholder="Describe the bug, the content you'd like removed and why, or anything else."
          required
        />
        {error?.field === "message" && <p className="field-error">{error.message}</p>}
      </div>

      <div>
        <label className="field-label" htmlFor="concern-page">
          Page (optional)
        </label>
        <input
          id="concern-page"
          name="pageUrl"
          type="url"
          className="num-input"
          placeholder="https://aureviews.com/courses/…"
        />
      </div>

      <div>
        <label className="field-label" htmlFor="concern-contact">
          Your email (optional — only if you want a reply)
        </label>
        <input
          id="concern-contact"
          name="contactEmail"
          type="email"
          className="num-input"
          placeholder="you@example.com"
          autoComplete="email"
        />
        {error?.field === "contactEmail" && <p className="field-error">{error.message}</p>}
      </div>

      {/* Honeypot: hidden from people, filled by bots; the action drops it. */}
      <div className="hp" aria-hidden="true">
        <label htmlFor="concern-website">Website</label>
        <input id="concern-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {error?.field === "form" && <p className="form-error">{error.message}</p>}

      <button type="submit" className="btn-post btn-block" disabled={pending}>
        {pending ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
