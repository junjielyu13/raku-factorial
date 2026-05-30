-- 20260530000001_add_it_role.sql
--
-- Add an 'it' role. IT staff hold full admin privileges but are NOT expected
-- to clock in, so the admin dashboard excludes them from absence checks.
-- (Junjie IT Admin is moved from 'admin' to 'it' manually after this runs.)

-- 1. Allow 'it' in the role check constraint.
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE public.employees
  ADD CONSTRAINT employees_role_check CHECK (role IN ('employee', 'admin', 'it'));

-- 2. Treat 'it' as admin for every authorization check (RLS, edit approvals,
--    corrections, export). Without this, moving Junjie to 'it' would strip
--    their admin access.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS bool
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = auth.uid() AND role IN ('admin', 'it') AND active = true
  );
$$;
