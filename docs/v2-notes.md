# v2 notes

Decisions and loose ends recorded during the v1 build that belong to the v2
roadmap, not to any v1 issue. Input for the v2 planning pass; nothing here is
scheduled. The v1 spec is [`v1-spec.md`](v1-spec.md); its §12 and §14 already
defer the admin console to v2, so this file records only what is *new* since
the spec was written.

## Admin dashboard (design-of-record: prototype #15)

- **It reads `review_reports`.** The table shipped in #27 (migration
  `0006_review_reports`): one row per "Report this review" submission —
  `review_id`, neutral `reason`, optional `details`, nullable
  `reporter_identity_hash`, `created_at`. The dashboard's reported-reviews
  queue is a view over this table; no new capture is needed.
- **Takedown = soft delete.** Sets `reviews.status = 'removed'`; the row
  stays. `review_reports` cascades only on a *hard* delete, which v1 never
  does — if the §11 tombstone purge is ever implemented as a hard `DELETE`,
  decide then whether report history should survive it.
- **The email push (§12) can stay or go** once the dashboard exists. Today it
  is the only notification channel (`OPERATOR_EMAIL`, via Resend); with a
  queue to look at, the owner may prefer a daily digest or nothing.
- **Author-side flow is already v1:** My Activity + "Contest this removal"
  is [#26](https://github.com/AUReviews/AUReviews/issues/26), and the runbook
  SQL scripts are [#28](https://github.com/AUReviews/AUReviews/issues/28). The
  dashboard replaces the runbook, not #26.

## Deliberately cut from v1 (owner decision on #27, 2026-08-21)

- **No site-side "Report a concern" form, no `concerns` table.** The spec's
  §11/§13 ungated concern form was dropped. Bugs and feature requests go to
  GitHub issue templates via footer links ("Report a bug", "Request a
  feature", plus a "GitHub" link). Reconsider only if GitHub turns out to be
  a real barrier for non-technical students.
- **No legal/removal contact on the site.** If an inbound address is ever
  needed it should be something like `admin@aureviews.com` and live on the
  GitHub org/repo, not in the website footer. The owner does not want
  "legal@" wording.
- **"Report this review" is open to everyone**, signed in or not. Only
  *authoring* is gated on `@auburn.edu`.

## Numbers to revisit with real traffic

- Report throttle: **5 per IP per hour**, logged in `email_send_log` under
  the sentinel address `review-report` so reports share the **90/day** global
  ceiling that protects the Resend sign-in-code quota
  (`src/auth/rate-limit.ts`). Both are launch guesses.
