-- A new pending request from the same employee for the same target_effective_id
-- (modify/delete) or same kind+day (add) supersedes the prior one — recorded
-- as a fourth status so the audit trail is preserved without showing the row
-- in the admin pending queue.
ALTER TABLE public.punch_edit_requests
  DROP CONSTRAINT IF EXISTS punch_edit_requests_status_check;

ALTER TABLE public.punch_edit_requests
  ADD CONSTRAINT punch_edit_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'superseded'));
