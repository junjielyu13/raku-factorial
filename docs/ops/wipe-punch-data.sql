-- Wipe all punch / request data, keep employees + office_locations.
-- Run in Supabase Studio → SQL Editor (uses postgres role, bypasses RLS).
--
-- IMPORTANT: irreversible. Take a backup first:
--   Supabase Dashboard → Database → Backups → "Create backup"
--
-- Tables wiped:
--   - punches              (raw clock-in/out events)
--   - effective_punches    (corrected/approved punches used for reports)
--   - punch_edit_requests  (correction / add / modify / delete requests)
--
-- Tables preserved:
--   - employees, auth.users  (staff can still log in)
--
-- Note: office_locations was dropped in migration 20260520000002; office
-- coords now live in src/lib/office.ts.

BEGIN;

-- Pre-counts (for the audit trail in query history)
SELECT 'before' AS phase,
       (SELECT count(*) FROM public.punches)              AS punches,
       (SELECT count(*) FROM public.effective_punches)    AS effective_punches,
       (SELECT count(*) FROM public.punch_edit_requests)  AS requests;

-- Single TRUNCATE handles the FK cycle between effective_punches
-- and punch_edit_requests in one step.
TRUNCATE TABLE
  public.punches,
  public.effective_punches,
  public.punch_edit_requests
RESTART IDENTITY CASCADE;

-- Post-counts (should all be 0)
SELECT 'after' AS phase,
       (SELECT count(*) FROM public.punches)              AS punches,
       (SELECT count(*) FROM public.effective_punches)    AS effective_punches,
       (SELECT count(*) FROM public.punch_edit_requests)  AS requests;

-- Sanity-check what we kept
SELECT 'kept' AS phase,
       (SELECT count(*) FROM public.employees) AS employees;

COMMIT;
