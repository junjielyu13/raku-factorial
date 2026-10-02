-- 20261002000002_company.sql
--
-- Company identity (razón social + CIF) for the compliance PDF (registro de
-- jornada). Single-row table: the CHECK on `id` makes a second row impossible.
-- Public business data, so the values are seeded here; edit via SQL.

CREATE TABLE public.company (
  id          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name        text NOT NULL CHECK (length(name) > 0),
  cif         text NOT NULL CHECK (cif ~ '^[A-Z][0-9]{7}[0-9A-J]$'),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.company (name, cif) VALUES ('RAKU RAKU SL', 'B23924483');

ALTER TABLE public.company ENABLE ROW LEVEL SECURITY;

-- Only the admin PDF export reads it.
CREATE POLICY "company admin read"
  ON public.company FOR SELECT
  USING (public.is_admin());

-- Cloud still auto-grants new public tables to anon/authenticated (until
-- 2026-10-30), so revoke first, then grant least privilege explicitly.
REVOKE ALL ON public.company FROM anon, authenticated;
GRANT SELECT ON public.company TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company TO service_role;
