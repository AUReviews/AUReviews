-- Resolve a contested removal (v1-spec §11/§12). Run ONE of the two blocks.
--
-- :review_id — the contested review's uuid.
--
-- List what's waiting:
SELECT id, course_id, removed_reason, removed_at, created_at
FROM reviews
WHERE status = 'removed' AND contested = true
ORDER BY removed_at;

-- (a) UPHOLD: the removal stands. Clears the contested flag so the author's
--     page shows the final state; the retention clock keeps running.
UPDATE reviews
SET contested = false
WHERE id = :'review_id' AND status = 'removed' AND contested = true
RETURNING id, status, contested;

-- (b) REINSTATE: the takedown was a mistake. The review goes back live with
--     its votes intact and the removal bookkeeping cleared.
-- UPDATE reviews
-- SET status = 'published',
--     contested = false,
--     removed_reason = NULL,
--     removed_at = NULL
-- WHERE id = :'review_id' AND status = 'removed'
-- RETURNING id, status;
--
-- After reinstating, revalidate the course page: POST /api/revalidate (see
-- src/app/api/revalidate/route.ts) or wait for the next ISR pass.
