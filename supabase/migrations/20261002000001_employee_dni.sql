-- 20261002000001_employee_dni.sql
--
-- Per-employee DNI/NIE for the compliance PDF (registro de jornada).
--
-- Kept in its own table rather than a column on `employees`, because
-- `employees` is readable by every authenticated user (name lookups) and a
-- DNI is personal data (RGPD). Only admins can read it; there is no write
-- path from the app — values are maintained via SQL (Studio / psql).
-- The actual values are NOT in this repo (it is public).

CREATE TABLE public.employee_dni (
  employee_id uuid PRIMARY KEY REFERENCES public.employees(id) ON DELETE CASCADE,
  dni         text NOT NULL CHECK (dni ~ '^([0-9]{8}|[XYZ][0-9]{7})[A-Z]$'),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_dni ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employee_dni admin read"
  ON public.employee_dni FOR SELECT
  USING (public.is_admin());

-- Cloud still auto-grants new public tables to anon/authenticated (until
-- 2026-10-30), so revoke first, then grant least privilege explicitly.
REVOKE ALL ON public.employee_dni FROM anon, authenticated;
GRANT SELECT ON public.employee_dni TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_dni TO service_role;
