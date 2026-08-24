-- Work the panic-switch queue (v1-spec §12; issue #28). While the Global
-- Config flag `moderationMode: "queue"` is up, new submissions land with
-- status='pending': live to their author on My Activity, invisible to
-- everyone else. After the crisis, publish the clean ones here; anything that
-- shouldn't publish goes through takedown.sql instead (so the author sees a
-- reason). Flip the flag back to "open" first or the queue keeps refilling.
--
-- See the backlog:
SELECT id, course_id, term_code, left(body, 120) AS body_start, created_at
FROM reviews
WHERE status = 'pending'
ORDER BY created_at;

-- Publish one (repeat per clean review):
-- psql: \set review_id '...'
UPDATE reviews
SET status = 'published'
WHERE id = :'review_id' AND status = 'pending'
RETURNING id, course_id, status;

-- Or, after review, publish the whole remaining backlog at once:
-- UPDATE reviews SET status = 'published' WHERE status = 'pending'
-- RETURNING id, course_id;

-- Afterwards: the affected course pages and browse-table numbers refresh on
-- the "reviews" tag / course paths: POST /api/revalidate (src/app/api/
-- revalidate/route.ts) or wait for the next ISR pass.
