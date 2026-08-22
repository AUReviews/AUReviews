-- Purge soft-deleted and removed reviews past their retention window to a
-- minimal tombstone (v1-spec §11): keep id, course_id, identity_hash,
-- created_at, deleted_at, status='deleted'; erase everything with
-- defamation/identifying value. The identity_hash trail survives so
-- delete-and-repost brigading stays detectable.
--
-- Windows mirror RETENTION_DAYS in src/domain/activity.ts: 30 days from
-- deleted_at for a self-delete, 90 days from removed_at for a takedown.
-- Both are 🔴 attorney-confirm (§10) before this runs on a schedule.
UPDATE reviews
SET body = '',
    overall = 0,
    difficulty = 0,
    workload_hours = 0,
    instructor_id = NULL,
    instructor_unknown = NULL,
    workload_shape = '[]'::jsonb,
    grade = NULL,
    languages = '[]'::jsonb,
    languages_other = NULL,
    curved = NULL,
    attendance = NULL,
    prep = NULL,
    removed_reason = NULL,
    contested = false,
    status = 'deleted',
    deleted_at = COALESCE(deleted_at, now())
WHERE body <> ''
  AND (
    (status = 'deleted' AND deleted_at < now() - interval '30 days')
    OR (status = 'removed' AND removed_at < now() - interval '90 days')
  )
RETURNING id, course_id, created_at, deleted_at;
