# Clock-In App

Spanish-labor-law-compliant punch-in/out web app for 5 employees.

## Stack

- React + Vite + TypeScript + Tailwind (deployed on Vercel)
- Supabase Postgres + Auth + Edge Functions + Realtime
- Playwright E2E

## Local development

```bash
npm install
supabase start
# In a separate terminal:
supabase functions serve --no-verify-jwt
# In a third:
npm run dev
```

Visit http://localhost:5173 and use the magic-link login.

## Environment

Create `.env.local`:

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<from `supabase status -o json | jq -r .PUBLISHABLE_KEY`>
```

## Tests

```bash
# RLS policies
for f in tests/rls/*.test.sql; do
  psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f "$f"
done

# Edge Functions (requires SUPABASE_SERVICE_ROLE_KEY + SUPABASE_ANON_KEY env vars)
export SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o json | jq -r .SERVICE_ROLE_KEY)
export SUPABASE_ANON_KEY=$(supabase status -o json | jq -r .ANON_KEY)
deno test --allow-all supabase/functions/*/test.ts supabase/functions/_shared/*.test.ts

# E2E (requires Playwright browsers installed: npx playwright install chromium)
VITE_SUPABASE_ANON_KEY=$(supabase status -o json | jq -r .ANON_KEY) \
npx playwright test
```

## Architecture

- All punch writes go through Edge Functions (service_role) — browser cannot INSERT directly. This is what enforces GPS geofence, server-side timestamps, and audit-trail integrity.
- Three time tables: `punches` (raw, never modified) + `punch_edit_requests` (approval flow) + `effective_punches` (used for reports).
- RLS: employees see only their own records; admin sees all; UPDATE/DELETE denied for everyone (Edge Functions use service_role to bypass).

## Docs

- Design spec: `docs/superpowers/specs/2026-05-16-clock-in-app-design.md`
- Implementation plan: `docs/superpowers/plans/2026-05-16-clock-in-app-implementation.md`

## Deployment

See the design spec section 8.2–8.5 for Supabase cloud setup and Vercel deployment steps (requires browser-UI interaction).
