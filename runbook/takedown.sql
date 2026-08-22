-- Take down one review (v1-spec §11.B/§12). Sets status='removed' with the
-- reason the author will see on My Activity and the timestamp the ~90-day
-- retention window counts from. The review drops out of every page and
-- aggregate immediately; its content stays for forensics/appeals until
-- purge-tombstones.sql runs.
--
-- :review_id — the uuid from the report email.
-- :reason    — either a REPORT_REASONS value (off-topic, identifying-info,
--              misconduct-accusation, protected-characteristic,
--              not-about-course, profanity, spam, other), shown by its
--              published label, or your own words, shown verbatim.
--
-- psql: \set review_id '...'  \set reason 'profanity'
UPDATE reviews
SET status = 'removed',
    removed_reason = :'reason',
    removed_at = now(),
    contested = false
WHERE id = :'review_id'
  AND status IN ('published', 'pending')
RETURNING id, course_id, status, removed_reason, removed_at;
