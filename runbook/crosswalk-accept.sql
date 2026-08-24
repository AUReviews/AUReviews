-- Accept a pending crosswalk match (v1-spec §12, ADR 0002): assert that the
-- incoming catalog key the import refused to guess about IS one of its
-- candidate Courses — a renumber (or admin-identified merge/split leg). Maps
-- the key onto the durable Course id (which never moves, ADR 0001), historises
-- the identity being replaced into former_identities, applies the scraped
-- attributes, and re-activates the Course. Reviews never move — that is the
-- whole point of the durable id.
--
-- :pending_id — the crosswalk_pending row's uuid (see the SELECT below).
-- :course_id  — the candidate Course uuid the key maps onto.
--
-- psql: \set pending_id '...'  \set course_id '...'
--
-- List what's waiting (candidate_course_ids are the plausible targets; payload
-- is everything the import saw):
SELECT id, catalog_key, title, reason, candidate_course_ids, created_at
FROM crosswalk_pending
WHERE status = 'pending'
ORDER BY created_at;

-- The whole decision is one transaction; every statement is guarded on the row
-- still being 'pending' AND on the key mapping to :course_id, so re-running is
-- a no-op — and if the key somehow got mapped to a DIFFERENT Course since the
-- row was queued, the script changes nothing and leaves the row pending
-- (steps 2/3 find no mapping to :course_id) instead of half-applying.
BEGIN;

-- 1. Map the key onto the Course. The Course's previous key(s) stay mapped
--    too — a Course accumulates keys across renumbers (schema.ts). DO NOTHING
--    keeps an existing mapping, whatever it points at; steps 2/3 then only
--    proceed if the key really resolves to :course_id.
INSERT INTO course_crosswalk (catalog_key, course_id)
SELECT p.catalog_key, :'course_id'
FROM crosswalk_pending p
WHERE p.id = :'pending_id' AND p.status = 'pending'
ON CONFLICT (catalog_key) DO NOTHING;

-- 2. Historise the outgoing identity (number/title only, schema.ts), then
--    last-import-wins the scraped attributes onto the Course and re-activate
--    it (the import retired it when its old number dropped out).
UPDATE courses c
SET former_identities = c.former_identities || jsonb_build_array(
      jsonb_build_object(
        'subject', c.subject,
        'number', c.number,
        'title', c.title,
        'catalogYearRange', c.catalog_year
      )
    ),
    subject      = p.payload->>'subject',
    number       = p.payload->>'number',
    title        = p.payload->>'title',
    description  = p.payload->>'description',
    credit_hours = p.payload->>'creditHours',
    prereq_text  = p.payload->>'prereqText',
    catalog_year = p.payload->>'catalogYear',
    status       = 'active',
    updated_at   = now()
FROM crosswalk_pending p
WHERE c.id = :'course_id'
  AND p.id = :'pending_id'
  AND p.status = 'pending'
  AND EXISTS (
    SELECT 1 FROM course_crosswalk cc
    WHERE cc.catalog_key = p.catalog_key AND cc.course_id = :'course_id'
  );

-- 3. Close the pending row (kept for audit; only status='pending' rows gate
--    the import's re-queue check).
UPDATE crosswalk_pending p
SET status = 'accepted'
WHERE p.id = :'pending_id'
  AND p.status = 'pending'
  AND EXISTS (
    SELECT 1 FROM course_crosswalk cc
    WHERE cc.catalog_key = p.catalog_key AND cc.course_id = :'course_id'
  );

COMMIT;

-- Afterwards: cached catalog pages still show the old identity until the
-- "catalog" tag revalidates — POST /api/revalidate (src/app/api/revalidate/
-- route.ts), run the manual catalog-refresh Action, or wait for the weekly one.
