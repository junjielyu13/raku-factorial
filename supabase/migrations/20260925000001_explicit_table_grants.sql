-- 20260925000001_explicit_table_grants.sql
--
-- Explicit Data API grants for every table/view in public.
--
-- From 2026-10-30 Supabase stops auto-granting anon/authenticated/service_role
-- on new public tables. Existing cloud tables keep their grants, but a fresh
-- `supabase db reset`, preview branch or new project would recreate them with
-- none. These grants make the migrations self-sufficient.
--
-- Least privilege: the cloud project currently has broader default grants
-- (this migration does not revoke them); RLS remains the row-level gate.
--   - anon: nothing (every screen requires login).
--   - authenticated: SELECT on what the frontend reads (also required for
--     Realtime postgres_changes), plus INSERT on punch_edit_requests (RLS
--     policy "edit_requests employee insert"). No UPDATE/DELETE anywhere —
--     punches are append-only; writes go through Edge Functions / RPCs.
--   - service_role: full DML (Edge Functions + test fixtures). SECURITY
--     DEFINER RPCs run as their owner and need no table grants.

GRANT SELECT ON public.employees         TO authenticated;
GRANT SELECT ON public.punches           TO authenticated;
GRANT SELECT ON public.effective_punches TO authenticated;
GRANT SELECT, INSERT ON public.punch_edit_requests TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees           TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.punches             TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.effective_punches   TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.punch_edit_requests TO service_role;

-- Views are security_invoker, so the caller also needs SELECT on the
-- underlying tables (granted above). Only export-month reads them.
GRANT SELECT ON public.daily_worked  TO service_role;
GRANT SELECT ON public.monthly_hours TO service_role;
