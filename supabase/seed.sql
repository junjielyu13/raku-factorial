-- supabase/seed.sql
-- Reset and seed local dev data. Run via `supabase db reset`.

-- Office location (Barcelona area)
INSERT INTO public.office_locations (id, name, latitude, longitude, radius_meters)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Oficina Principal', 41.478107, 2.084087, 200);

-- A demo admin user. Real production setup creates this via Studio + magic link.
-- For local dev, supabase creates auth.users via auth.admin API on first login.
-- This seed only sets up the employees row for an existing auth.users record
-- (you'll create the user separately in Step 2).
