-- Merge two Instructor rows that are the same person (v1-spec §12; e.g.
-- "W. H. Heaton" vs. "William Haynes Heaton"): repoint the duplicate's
-- Offerings and Reviews onto the keeper, carry over the Banner NetID if only
-- the duplicate had one, and delete the duplicate row. Also the resolution
-- tool for an instructor_pending row whose answer is "same person"; resolve
-- the queue row with the optional statement at the bottom.
--
-- :keep_id:  the Instructor uuid that survives (usually the fuller name).
-- :merge_id: the duplicate Instructor uuid that goes away.
--
-- psql: \set keep_id '...'  \set merge_id '...'
--
-- Find candidates / what's waiting:
--   SELECT id, display_name, banner_key, name_key FROM instructors
--   ORDER BY name_key;
--   SELECT id, display_name, reason, candidate_instructor_ids
--   FROM instructor_pending WHERE status = 'pending';
--
-- One transaction; a re-run finds no rows pointing at :merge_id and no
-- :merge_id row to delete, so it is a no-op.
BEGIN;

-- Refuse a self-merge outright (aborts the transaction on a bad paste).
SELECT CASE WHEN :'keep_id' = :'merge_id'
  THEN 1/0 -- keep_id and merge_id are the same row; nothing to merge
  ELSE 0 END;

-- 1. Stash what the duplicate knows before it goes.
CREATE TEMP TABLE _merge_src ON COMMIT DROP AS
SELECT banner_key FROM instructors WHERE id = :'merge_id';

-- 2. Repoint reviews. The review row's content is untouched; the durable
--    instructor id it captured at write time simply resolves to the keeper
--    now (ADR 0001).
UPDATE reviews
SET instructor_id = :'keep_id'
WHERE instructor_id = :'merge_id';

-- 3. Repoint offering links. The keeper may already be listed on the same
--    (course, term); the composite PK makes that an ignore, not an error.
INSERT INTO offering_instructors (course_id, term_code, instructor_id)
SELECT course_id, term_code, :'keep_id'
FROM offering_instructors
WHERE instructor_id = :'merge_id'
ON CONFLICT DO NOTHING;

DELETE FROM offering_instructors WHERE instructor_id = :'merge_id';

-- 4. Delete the duplicate, then carry its Banner NetID onto the keeper if the
--    keeper lacks one (in this order because banner_key is unique: the keeper
--    can only take it once the duplicate no longer holds it). Future imports
--    keyed on that NetID then resolve straight to the keeper.
DELETE FROM instructors WHERE id = :'merge_id';

UPDATE instructors
SET banner_key = (SELECT banner_key FROM _merge_src),
    updated_at = now()
WHERE id = :'keep_id'
  AND banner_key IS NULL
  AND (SELECT banner_key FROM _merge_src) IS NOT NULL;

-- 5. If this merge answers a queued instructor_pending sighting, close it
--    (kept for audit; only status='pending' rows gate the import's re-queue
--    check). Uncomment and set :pending_name_key.
-- UPDATE instructor_pending
-- SET status = 'resolved'
-- WHERE name_key = :'pending_name_key' AND status = 'pending';

COMMIT;

-- Caveats:
-- * v1 has no name-alias table: if Banner still lists the merged spelling
--   WITHOUT a NetID, a later offerings import may re-mint the duplicate;
--   just re-run this merge.
-- * Course pages cache their instructor lists; revalidate the affected
--   courses (POST /api/revalidate) or wait for the next catalog refresh.
