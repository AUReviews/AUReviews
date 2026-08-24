-- Reject a pending crosswalk match (v1-spec §12, ADR 0002): the flagged
-- resemblance was a coincidence, and the incoming catalog key is a genuinely
-- new course, not a renumber of any candidate. Mints a fresh durable Course from
-- the scraped payload and maps the key to it: exactly what the import's create
-- path would have done had nothing looked ambiguous. Any candidate Course the
-- import retired stays retired (ADR 0002: retire, never delete).
--
-- :pending_id: the crosswalk_pending row's uuid (see the SELECT in
--              crosswalk-accept.sql for what's waiting).
--
-- psql: \set pending_id '...'
--
-- One transaction, all statements guarded on the row still being 'pending'
-- (and the key still unmapped), so re-running is a no-op.
BEGIN;

-- 1. Mint the new durable Course from what the import saw, and map its key
--    atomically, so a re-run can't strand an unmapped Course row.
WITH p AS (
  SELECT id, catalog_key, payload
  FROM crosswalk_pending
  WHERE id = :'pending_id'
    AND status = 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM course_crosswalk cc
      WHERE cc.catalog_key = crosswalk_pending.catalog_key
    )
),
minted AS (
  INSERT INTO courses
    (id, subject, number, title, description, credit_hours, prereq_text,
     catalog_year, status)
  SELECT gen_random_uuid(),
         payload->>'subject',
         payload->>'number',
         payload->>'title',
         payload->>'description',
         payload->>'creditHours',
         payload->>'prereqText',
         payload->>'catalogYear',
         'active'
  FROM p
  RETURNING id
)
INSERT INTO course_crosswalk (catalog_key, course_id)
SELECT p.catalog_key, minted.id
FROM p, minted;

-- 2. Close the pending row (kept for audit).
UPDATE crosswalk_pending
SET status = 'rejected'
WHERE id = :'pending_id' AND status = 'pending';

COMMIT;

-- Afterwards: the new course appears once the "catalog" tag revalidates:
-- POST /api/revalidate, run the manual catalog-refresh Action, or wait for the
-- weekly one (which also fills in the course's offerings).
