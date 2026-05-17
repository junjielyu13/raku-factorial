# CLAUDE.md

Project-specific instructions for Claude Code working in this repo.

## What this project is

A clock-in/clock-out web app for a 5-person company in Spain. Compliant with **RD-ley 8/2019** (Spanish labor law requires recording start/end times of every workday). Free-tier serverless: Supabase + Vercel.

## Tech stack

- **Frontend**: React 19 + Vite + TypeScript + Tailwind v3, React Router v6
- **Backend**: Supabase (Postgres + Auth + Edge Functions in Deno + Realtime + RLS)
- **Hosting**: Vercel (frontend), Supabase cloud (backend)
- **Auth**: Supabase Auth, **password-based** (not magic-link — hit email rate limits)

## Authorized workflows

- **Commit directly to `main`** — user has explicitly approved this. No feature branches needed.
- **`.env.local` contains a DB password** with intentional typo `database_paassword=...`. **Do not "fix" the typo, do not surface or echo it.** It is gitignored.
- **Supabase CLI login**: user uses a Personal Access Token (`supabase login --token sbp_...`). The token is on the user's machine, never in this repo.

## Architecture invariants (do not break)

1. **`punches` table is append-only and immutable**. Server-side timestamps only (`server_time`). RLS forbids UPDATE/DELETE on `punches`. Required by Spanish labor law audit trail.
2. **All punch inserts go through the `create_punch` RPC** (SECURITY DEFINER, REVOKE'd from `anon`/`authenticated`, only callable via Edge Function with service-role client). The RPC does dedup + sequence check + advisory lock atomically.
3. **Corrections go through `punch_edit_requests`** (employee submits → admin approves/rejects). Approved edits appear in `effective_punches` view; original `punches` row stays untouched.
4. **All Postgres views use `WITH (security_invoker = on)`** — views bypass RLS by default in PG ≤14. We're on 15+ but keep the flag explicit.
5. **GPS is recorded but not enforced**. Edge function requires `latitude`/`longitude` (rejects `GPS_REQUIRED` if missing), but no geofence check. Admin dashboard shows ⚠️ when punch is > 2km from office (haversine, `FAR_THRESHOLD_M = 2000`).

## i18n convention

- All user-visible strings live in `src/i18n/messages.ts` under three keys: `zh`, `en`, `es`.
- Components use `const { t } = useTranslation()` and `t('namespace.key', { var: value })`.
- **When adding any new UI string, add it to all three languages** in `messages.ts` — never hardcode.
- Variable interpolation uses `{var}` syntax (not `{{var}}`).
- Locale persists in `localStorage.app.lang`, defaults to browser language.
- Date/time formatting goes through `src/lib/time.ts` which auto-uses current locale; timezone is always `Europe/Madrid` (DST-safe).

## Supabase gotchas

- **`db.<ref>.supabase.co` only resolves over IPv6.** Direct `psql` from this Mac fails. Use **Supavisor pooler** `aws-0-eu-central-1.pooler.supabase.com:6543` (user `postgres.<project_ref>`), or paste SQL into Studio SQL editor.
- **`psql` is not on PATH** by default. User installed via `brew install libpq` (keg-only). Full path: `/opt/homebrew/opt/libpq/bin/psql`.
- **Two key formats coexist.** CLI v2.x emits both:
  - Legacy JWT (`ANON_KEY`, `SERVICE_ROLE_KEY`) — used in `supabase/functions/*/test.ts` and Deno tests
  - New (`PUBLISHABLE_KEY` = `sb_publishable_*`, `SECRET_KEY` = `sb_secret_*`) — used in frontend `.env.local` as `VITE_SUPABASE_ANON_KEY`
  - Both reachable via `supabase status -o json | jq -r .<KEY_NAME>`
- **Use `execute_sql` / `supabase db query` for iterative schema work, not `apply_migration`** — `apply_migration` writes a history entry per call and breaks `db pull`/`db diff`. Generate the final migration with `supabase db pull <name> --local --yes`.

## Frontend gotchas

- **`supabase-js` v2 puts `error.context` as a `Response` instance**, not a parsed object. To read Edge Function error body: `await error.context.clone().json()`. See `src/lib/api.ts:invoke()`.
- **Login redirect**: use `useNavigate()` + `nav('/', { replace: true })`, not `window.location.replace` — the latter was unreliable.
- **Vercel SPA routing**: `vercel.json` rewrites all paths to `/index.html`. Don't remove.

## Common commands

```bash
# Frontend
npm run dev                 # vite dev server (port 5173)
npm run build               # tsc + vite build
npm run test:unit           # vitest
npm run test:e2e            # playwright

# Supabase (local)
supabase start              # starts Docker stack — needs Docker Desktop running
supabase status -o json     # all URLs and keys as JSON
supabase db reset           # rerun migrations + seed.sql

# Supabase (cloud)
supabase link --project-ref gdacfthuunkcilcwwopb
supabase functions deploy <name>
supabase db push            # apply pending migrations to linked cloud project

# psql to cloud via pooler
/opt/homebrew/opt/libpq/bin/psql "postgresql://postgres.gdacfthuunkcilcwwopb:<pw>@aws-0-eu-central-1.pooler.supabase.com:6543/postgres"
```

## File map

```
src/
├── auth/              # LoginPage, RequireAuth, AuthContext
├── employee/          # EmployeeHome, EmployeeHistory, SubmitEditRequest
├── admin/             # AdminDashboard, AdminApprovals, AdminExport
├── components/        # PunchButton, LanguagePicker
├── i18n/              # messages.ts (all strings), LanguageContext.tsx
├── lib/               # supabase client, api wrappers, types, time/locale, geolocation
└── App.tsx            # Provider wrapping + Router

supabase/
├── migrations/        # SQL migrations (numeric prefix = order)
├── functions/         # Deno Edge Functions; _shared/ for common helpers
└── seed.sql           # local-dev seed (office location, etc.)

docs/
├── superpowers/specs/         # design doc
├── superpowers/plans/         # implementation plan (8-phase)
└── admin-guide.md             # how to add employees, etc.
```

## When something is off

- **Punch fails with "UNKNOWN"** → check `src/lib/api.ts:invoke()` is reading `error.context` as a Response (`await ctx.clone().json()`).
- **`/auth/callback` 404 on Vercel** → check `vercel.json` rewrite is in place.
- **Magic-link rate limit error** → we don't use magic links anymore; if any code path still calls `signInWithOtp`, remove it.
- **Translation key shows as literal `namespace.key`** → key is missing from `messages.ts`. Add to all three languages.
