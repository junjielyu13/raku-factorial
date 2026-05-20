-- supabase/seed.sql
-- Reset and seed local dev data. Run via `supabase db reset`.

-- Office location is now hardcoded in src/lib/office.ts.

-- A demo admin user. Real production setup creates this via Studio + magic link.
-- For local dev, supabase creates auth.users via auth.admin API on first login.
-- This seed only sets up the employees row for an existing auth.users record
-- (you'll create the user separately in Step 2).
