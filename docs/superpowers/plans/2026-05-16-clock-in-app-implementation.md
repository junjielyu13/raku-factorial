# Employee Clock-In App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a compliant employee clock-in/out web app for 5 employees in Spain, satisfying RD-ley 8/2019 (immutable records, server-side GPS geofence verification, audit-traceable corrections, monthly CSV export).

**Architecture:** React+Vite SPA (Vercel) → Supabase JS SDK → Supabase Edge Functions (Deno) → Postgres with RLS. All writes go through Edge Functions using service_role; browser cannot INSERT directly. Three-layer time truth: `punches` (raw, never modified) + `punch_edit_requests` (approval flow) + `effective_punches` (used for reports).

**Tech Stack:** React 18, Vite, TypeScript, React Router 6, Tailwind CSS, Supabase JS v2, Deno (Edge Functions), Postgres 15, Playwright (E2E), Vitest (FE unit if needed), GitHub Actions (CI), Vercel (hosting).

**Spec:** `docs/superpowers/specs/2026-05-16-clock-in-app-design.md`

---

## File Structure

```
.
├── .env.example                        # template for env vars
├── .gitignore
├── .github/workflows/test.yml          # CI: RLS + Edge Function tests
├── index.html                          # Vite entry
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── playwright.config.ts
├── README.md
├── docs/superpowers/
│   ├── specs/2026-05-16-clock-in-app-design.md     # exists
│   └── plans/2026-05-16-clock-in-app-implementation.md  # this file
├── supabase/
│   ├── config.toml                     # Supabase local config
│   ├── seed.sql                        # demo office + admin
│   ├── migrations/
│   │   ├── 20260516000001_schema.sql
│   │   ├── 20260516000002_rls.sql
│   │   ├── 20260516000003_views.sql
│   │   └── 20260516000004_rpc.sql
│   └── functions/
│       ├── _shared/
│       │   ├── auth.ts                 # JWT verify, role lookup
│       │   ├── haversine.ts            # distance calc
│       │   └── errors.ts               # typed error responses
│       ├── punch-in/
│       │   ├── index.ts
│       │   └── test.ts
│       ├── submit-edit-request/
│       │   ├── index.ts
│       │   └── test.ts
│       ├── approve-edit/
│       │   ├── index.ts
│       │   └── test.ts
│       ├── reject-edit/
│       │   ├── index.ts
│       │   └── test.ts
│       └── export-month/
│           ├── index.ts
│           └── test.ts
├── tests/rls/
│   ├── helpers.sql                     # JWT-mocking helpers
│   ├── punches.test.sql
│   └── edit_requests.test.sql
├── e2e/
│   ├── employee-punch-in.spec.ts
│   └── admin-approve-edit.spec.ts
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── router.tsx
    ├── index.css
    ├── lib/
    │   ├── supabase.ts                 # browser client
    │   ├── api.ts                      # Edge Function wrappers
    │   ├── geolocation.ts              # getCurrentPosition Promise wrapper
    │   ├── time.ts                     # Europe/Madrid formatting
    │   └── types.ts                    # shared TS types matching DB
    ├── auth/
    │   ├── AuthProvider.tsx
    │   ├── useAuth.ts
    │   ├── LoginPage.tsx
    │   ├── AuthCallback.tsx            # handles magic link return
    │   └── RequireAuth.tsx             # route guard
    ├── employee/
    │   ├── EmployeeHome.tsx            # punch button + today status
    │   ├── EmployeeHistory.tsx
    │   └── SubmitEditRequest.tsx
    ├── admin/
    │   ├── AdminDashboard.tsx          # realtime today list
    │   ├── AdminApprovals.tsx
    │   └── AdminExport.tsx
    └── components/
        ├── PunchButton.tsx
        ├── ErrorBanner.tsx
        └── Spinner.tsx
```

**File responsibilities (key ones):**
- `supabase/functions/_shared/auth.ts` — JWT verification, role lookup. Used by every Edge Function.
- `supabase/functions/_shared/haversine.ts` — distance calc. Single source of geofence math; tested in isolation.
- `supabase/functions/punch-in/index.ts` — orchestrates: auth → geofence → dedup → sequence → RPC. Each piece is a separate function call.
- `src/lib/api.ts` — frontend-side Edge Function wrappers; isolates `supabase.functions.invoke` plumbing from UI.
- `src/lib/geolocation.ts` — Promise wrapper around `navigator.geolocation.getCurrentPosition`; handles permission denied as a typed error.

---

## Phase 1: Project Setup

### Task 1.1: Initialize Vite + React + TS project

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`
- Create: `.gitignore`

- [ ] **Step 1: Bootstrap Vite project**

```bash
npm create vite@latest . -- --template react-ts
```

When prompted, accept overwriting the empty directory.

- [ ] **Step 2: Install base dependencies**

```bash
npm install react-router-dom@^6.22 @supabase/supabase-js@^2.43
npm install -D tailwindcss@^3.4 postcss@^8 autoprefixer@^10 \
  @types/node vitest@^1.6 @playwright/test@^1.43
```

- [ ] **Step 3: Configure Tailwind**

```bash
npx tailwindcss init -p
```

Replace `tailwind.config.js` with:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
};
```

Replace `src/index.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 4: Add base scripts to package.json**

Edit `package.json` so `"scripts"` contains:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test:unit": "vitest run",
    "test:e2e": "playwright test"
  }
}
```

- [ ] **Step 5: Write `.gitignore`**

```
node_modules/
dist/
.env
.env.local
.DS_Store
supabase/.branches
supabase/.temp
playwright-report/
test-results/
.vercel/
```

- [ ] **Step 6: Verify dev server boots**

```bash
npm run dev
```

Expected: Vite reports `Local: http://localhost:5173/`, you can open it and see the Vite default page.

Stop the dev server with `Ctrl-C`.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: scaffold Vite + React + Tailwind project"
```

---

### Task 1.2: Install and initialize Supabase CLI locally

**Files:** Create `supabase/config.toml` (auto-generated)

- [ ] **Step 1: Install Supabase CLI**

```bash
brew install supabase/tap/supabase
```

(If not on macOS, see https://supabase.com/docs/guides/cli for install instructions.)

- [ ] **Step 2: Init Supabase project structure**

```bash
supabase init
```

Expected: creates `supabase/config.toml` and `supabase/migrations/` directory.

- [ ] **Step 3: Start local Supabase stack**

```bash
supabase start
```

This boots Postgres, Auth, Storage, Edge Runtime in Docker. Takes ~30s first time.

Expected output ends with:
```
API URL: http://127.0.0.1:54321
DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
Studio URL: http://127.0.0.1:54323
anon key: eyJh...
service_role key: eyJh...
```

Copy the `anon key` and `service_role key` for the next step.

- [ ] **Step 4: Create `.env.example` and `.env.local`**

Create `.env.example`:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=replace-me
```

Create `.env.local` (NOT committed) with the actual `anon key` from `supabase start`:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<paste anon key from step 3>
```

- [ ] **Step 5: Commit (excluding .env.local)**

```bash
git add supabase/config.toml .env.example
git commit -m "chore: init Supabase local stack and env template"
```

---

## Phase 2: Database Schema + RLS

### Task 2.1: Write schema migration

**Files:** Create `supabase/migrations/20260516000001_schema.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 20260516000001_schema.sql

-- Employees (1:1 with auth.users)
CREATE TABLE public.employees (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text UNIQUE NOT NULL,
  full_name   text NOT NULL,
  role        text NOT NULL CHECK (role IN ('employee', 'admin')),
  active      bool NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Office geofences
CREATE TABLE public.office_locations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  latitude       numeric(9,6) NOT NULL,
  longitude      numeric(9,6) NOT NULL,
  radius_meters  integer NOT NULL DEFAULT 200 CHECK (radius_meters > 0),
  active         bool NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Raw punches: INSERT-only, never modified
CREATE TABLE public.punches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  uuid NOT NULL REFERENCES public.employees(id),
  kind         text NOT NULL CHECK (kind IN ('in', 'out')),
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  latitude     numeric(9,6) NOT NULL,
  longitude    numeric(9,6) NOT NULL,
  accuracy_m   numeric,
  office_id    uuid NOT NULL REFERENCES public.office_locations(id),
  user_agent   text,
  ip_address   inet
);
CREATE INDEX idx_punches_employee_recorded
  ON public.punches (employee_id, recorded_at DESC);

-- Correction requests
CREATE TABLE public.punch_edit_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id        uuid NOT NULL REFERENCES public.employees(id),
  original_punch_id  uuid REFERENCES public.punches(id),
  requested_kind     text NOT NULL CHECK (requested_kind IN ('in', 'out')),
  requested_time     timestamptz NOT NULL,
  reason             text NOT NULL CHECK (length(reason) > 0),
  status             text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by        uuid REFERENCES public.employees(id),
  reviewed_at        timestamptz,
  review_note        text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_edit_requests_status_created
  ON public.punch_edit_requests (status, created_at DESC);

-- Effective punches: used for reports
CREATE TABLE public.effective_punches (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id        uuid NOT NULL REFERENCES public.employees(id),
  kind               text NOT NULL CHECK (kind IN ('in', 'out')),
  effective_time     timestamptz NOT NULL,
  source_punch_id    uuid REFERENCES public.punches(id),
  source_request_id  uuid REFERENCES public.punch_edit_requests(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (source_punch_id IS NOT NULL AND source_request_id IS NULL) OR
    (source_punch_id IS NULL AND source_request_id IS NOT NULL)
  )
);
CREATE INDEX idx_effective_employee_time
  ON public.effective_punches (employee_id, effective_time DESC);
```

- [ ] **Step 2: Apply migration**

```bash
supabase db reset
```

Expected: drops local db, replays migrations, no errors.

- [ ] **Step 3: Verify tables exist**

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "\dt public.*"
```

Expected: 5 rows (employees, office_locations, punches, punch_edit_requests, effective_punches).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260516000001_schema.sql
git commit -m "feat(db): add schema for employees, punches, edit requests"
```

---

### Task 2.2: Write RLS migration

**Files:** Create `supabase/migrations/20260516000002_rls.sql`

- [ ] **Step 1: Write the RLS policies**

```sql
-- 20260516000002_rls.sql

-- Enable RLS on all tables
ALTER TABLE public.employees           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_locations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.punches             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.punch_edit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.effective_punches   ENABLE ROW LEVEL SECURITY;

-- Helper: is current user admin?
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS bool
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = auth.uid() AND role = 'admin' AND active = true
  );
$$;

-- employees: everyone reads (for name lookups); admin writes
CREATE POLICY "employees read all"
  ON public.employees FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "employees admin write"
  ON public.employees FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- office_locations: read active rows; admin manages
CREATE POLICY "office_locations read active"
  ON public.office_locations FOR SELECT
  USING (active OR public.is_admin());
CREATE POLICY "office_locations admin write"
  ON public.office_locations FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- punches: employees read own; admin reads all; NOBODY inserts/updates/deletes
-- (Edge Functions use service_role to bypass RLS)
CREATE POLICY "punches read own"
  ON public.punches FOR SELECT
  USING (employee_id = auth.uid() OR public.is_admin());
-- No INSERT/UPDATE/DELETE policy → denied for all non-service_role roles

-- effective_punches: same as punches
CREATE POLICY "effective_punches read own"
  ON public.effective_punches FOR SELECT
  USING (employee_id = auth.uid() OR public.is_admin());

-- punch_edit_requests: employee inserts/reads own; admin reads all
CREATE POLICY "edit_requests read own or admin"
  ON public.punch_edit_requests FOR SELECT
  USING (employee_id = auth.uid() OR public.is_admin());
CREATE POLICY "edit_requests employee insert"
  ON public.punch_edit_requests FOR INSERT
  WITH CHECK (employee_id = auth.uid() AND status = 'pending');
-- UPDATE only via Edge Function with service_role; no policy here
```

- [ ] **Step 2: Apply migration**

```bash
supabase db reset
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260516000002_rls.sql
git commit -m "feat(db): add RLS policies (employees, punches read-only via service role for writes)"
```

---

### Task 2.3: Write views and reporting SQL

**Files:** Create `supabase/migrations/20260516000003_views.sql`

- [ ] **Step 1: Write the views**

```sql
-- 20260516000003_views.sql

-- Per-day worked duration: pair each "in" with the next "out" for the same employee
CREATE OR REPLACE VIEW public.daily_worked AS
WITH paired AS (
  SELECT
    ep.employee_id,
    ep.effective_time AS in_time,
    LEAD(ep.effective_time) OVER (
      PARTITION BY ep.employee_id ORDER BY ep.effective_time
    ) AS next_time,
    ep.kind,
    LEAD(ep.kind) OVER (
      PARTITION BY ep.employee_id ORDER BY ep.effective_time
    ) AS next_kind
  FROM public.effective_punches ep
)
SELECT
  employee_id,
  (in_time AT TIME ZONE 'Europe/Madrid')::date AS work_date,
  in_time,
  next_time AS out_time,
  (next_time - in_time) AS duration
FROM paired
WHERE kind = 'in' AND next_kind = 'out';

-- Monthly hours per employee (in Europe/Madrid)
CREATE OR REPLACE VIEW public.monthly_hours AS
SELECT
  employee_id,
  date_trunc('month', work_date)::date AS month,
  sum(duration) AS worked_total
FROM public.daily_worked
GROUP BY employee_id, date_trunc('month', work_date);

-- Make views inherit RLS from underlying tables
ALTER VIEW public.daily_worked   SET (security_invoker = on);
ALTER VIEW public.monthly_hours  SET (security_invoker = on);
```

- [ ] **Step 2: Apply and verify**

```bash
supabase db reset
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -c "SELECT * FROM public.monthly_hours LIMIT 1;"
```

Expected: empty result, no error.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260516000003_views.sql
git commit -m "feat(db): add daily_worked and monthly_hours views"
```

---

### Task 2.4: Write transactional punch RPC

**Files:** Create `supabase/migrations/20260516000004_rpc.sql`

- [ ] **Step 1: Write the RPC**

```sql
-- 20260516000004_rpc.sql

-- Atomic punch creation: insert into punches and effective_punches in one tx
CREATE OR REPLACE FUNCTION public.create_punch(
  p_employee_id uuid,
  p_kind        text,
  p_lat         numeric,
  p_lng         numeric,
  p_accuracy    numeric,
  p_office_id   uuid,
  p_user_agent  text,
  p_ip          inet
) RETURNS TABLE (
  id          uuid,
  recorded_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_punch_id    uuid;
  v_recorded_at timestamptz;
BEGIN
  INSERT INTO public.punches
    (employee_id, kind, latitude, longitude, accuracy_m, office_id, user_agent, ip_address)
  VALUES
    (p_employee_id, p_kind, p_lat, p_lng, p_accuracy, p_office_id, p_user_agent, p_ip)
  RETURNING punches.id, punches.recorded_at
  INTO v_punch_id, v_recorded_at;

  INSERT INTO public.effective_punches
    (employee_id, kind, effective_time, source_punch_id)
  VALUES
    (p_employee_id, p_kind, v_recorded_at, v_punch_id);

  RETURN QUERY SELECT v_punch_id, v_recorded_at;
END;
$$;

-- Atomic approval: insert effective_punches row, update request status
CREATE OR REPLACE FUNCTION public.approve_edit_request(
  p_request_id  uuid,
  p_reviewer_id uuid,
  p_note        text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.punch_edit_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM public.punch_edit_requests
    WHERE id = p_request_id FOR UPDATE;

  IF v_req IS NULL THEN
    RAISE EXCEPTION 'request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'request already %', v_req.status USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.effective_punches
    (employee_id, kind, effective_time, source_request_id)
  VALUES
    (v_req.employee_id, v_req.requested_kind, v_req.requested_time, v_req.id);

  UPDATE public.punch_edit_requests
    SET status='approved', reviewed_by=p_reviewer_id, reviewed_at=now(), review_note=p_note
    WHERE id = p_request_id;
END;
$$;

-- Reject (no effective_punches row)
CREATE OR REPLACE FUNCTION public.reject_edit_request(
  p_request_id  uuid,
  p_reviewer_id uuid,
  p_note        text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.punch_edit_requests
    WHERE id = p_request_id FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'request already %', v_status USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.punch_edit_requests
    SET status='rejected', reviewed_by=p_reviewer_id, reviewed_at=now(), review_note=p_note
    WHERE id = p_request_id;
END;
$$;

-- Restrict RPC execution: only service_role (Edge Functions) calls these
REVOKE EXECUTE ON FUNCTION public.create_punch         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.approve_edit_request FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reject_edit_request  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.create_punch         TO service_role;
GRANT  EXECUTE ON FUNCTION public.approve_edit_request TO service_role;
GRANT  EXECUTE ON FUNCTION public.reject_edit_request  TO service_role;
```

- [ ] **Step 2: Apply and verify**

```bash
supabase db reset
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -c "\df public.create_punch"
```

Expected: function listed.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260516000004_rpc.sql
git commit -m "feat(db): add transactional RPCs for punch insert and approval"
```

---

### Task 2.5: Write seed data

**Files:** Create `supabase/seed.sql`

- [ ] **Step 1: Write seed**

```sql
-- supabase/seed.sql
-- Reset and seed local dev data. Run via `supabase db reset`.

-- One office location (Madrid Sol as placeholder; replace with real coords)
INSERT INTO public.office_locations (id, name, latitude, longitude, radius_meters)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Oficina Principal', 40.416775, -3.703790, 200);

-- A demo admin user. Real production setup creates this via Studio + magic link.
-- For local dev, supabase creates auth.users via auth.admin API on first login.
-- This seed only sets up the employees row for an existing auth.users record
-- (you'll create the user separately in Step 2).
```

- [ ] **Step 2: Apply and verify office location exists**

```bash
supabase db reset
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -c "SELECT name, radius_meters FROM public.office_locations;"
```

Expected: one row "Oficina Principal".

- [ ] **Step 3: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat(db): seed default office location"
```

---

### Task 2.6: Write RLS test helpers

**Files:** Create `tests/rls/helpers.sql`

- [ ] **Step 1: Write helper script**

```sql
-- tests/rls/helpers.sql
-- Helpers to simulate a logged-in user inside a SQL session.

CREATE OR REPLACE FUNCTION test_set_user(user_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', user_id::text, 'role', 'authenticated')::text,
    true);
  PERFORM set_config('role', 'authenticated', true);
END;
$$;

CREATE OR REPLACE FUNCTION test_set_anon()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM set_config('role', 'anon', true);
END;
$$;

-- Create a deterministic test user + employee row
CREATE OR REPLACE FUNCTION test_make_user(p_email text, p_role text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, email, aud, role)
  VALUES (v_id, p_email, 'authenticated', 'authenticated');
  INSERT INTO public.employees (id, email, full_name, role)
  VALUES (v_id, p_email, split_part(p_email, '@', 1), p_role);
  RETURN v_id;
END;
$$;
```

- [ ] **Step 2: Verify helpers load without error**

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -f tests/rls/helpers.sql
```

Expected: three CREATE FUNCTION lines, no errors.

- [ ] **Step 3: Commit**

```bash
git add tests/rls/helpers.sql
git commit -m "test(rls): add helpers for impersonating users"
```

---

### Task 2.7: RLS test — employee cannot read other employee's punches

**Files:** Create `tests/rls/punches.test.sql`

- [ ] **Step 1: Write the test (failing-style assertion)**

```sql
-- tests/rls/punches.test.sql
\set ON_ERROR_STOP on
BEGIN;
\i tests/rls/helpers.sql

DO $$
DECLARE
  alice  uuid := test_make_user('alice@test.local', 'employee');
  bob    uuid := test_make_user('bob@test.local',   'employee');
  office uuid;
  n int;
BEGIN
  SELECT id INTO office FROM public.office_locations LIMIT 1;

  -- Insert a punch for Bob using service_role-like bypass
  PERFORM set_config('role', 'postgres', true);
  INSERT INTO public.punches (employee_id, kind, latitude, longitude, office_id)
  VALUES (bob, 'in', 40.416775, -3.703790, office);

  -- Switch to Alice and count Bob's punches
  PERFORM test_set_user(alice);
  SELECT count(*) INTO n FROM public.punches WHERE employee_id = bob;
  ASSERT n = 0, format('Alice saw %s of Bobs punches; expected 0', n);

  -- Switch to Bob; should see his own
  PERFORM test_set_user(bob);
  SELECT count(*) INTO n FROM public.punches WHERE employee_id = bob;
  ASSERT n = 1, format('Bob saw %s of his own punches; expected 1', n);
END $$;

ROLLBACK;
```

- [ ] **Step 2: Run the test against fresh DB**

```bash
supabase db reset
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -f tests/rls/punches.test.sql
```

Expected: completes silently, exit code 0. If any assert fails you'll see `ERROR: ...`.

- [ ] **Step 3: Commit**

```bash
git add tests/rls/punches.test.sql
git commit -m "test(rls): employee can only read own punches"
```

---

### Task 2.8: RLS test — employee cannot INSERT to punches

**Files:** Modify `tests/rls/punches.test.sql`

- [ ] **Step 1: Append the test case**

Add inside the same `DO $$` block before `END $$;`, after the existing assertions:

```sql
  -- As Bob, attempting direct INSERT must fail
  PERFORM test_set_user(bob);
  BEGIN
    INSERT INTO public.punches (employee_id, kind, latitude, longitude, office_id)
    VALUES (bob, 'in', 40.416775, -3.703790, office);
    ASSERT false, 'Bob was able to insert directly; RLS broken';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    NULL; -- expected
  END;
```

- [ ] **Step 2: Run**

```bash
supabase db reset && \
  psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f tests/rls/punches.test.sql
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add tests/rls/punches.test.sql
git commit -m "test(rls): employees cannot INSERT to punches directly"
```

---

### Task 2.9: RLS test — admin sees all punches and edit requests

**Files:** Create `tests/rls/edit_requests.test.sql`

- [ ] **Step 1: Write the test**

```sql
-- tests/rls/edit_requests.test.sql
\set ON_ERROR_STOP on
BEGIN;
\i tests/rls/helpers.sql

DO $$
DECLARE
  alice uuid := test_make_user('alice2@test.local', 'employee');
  boss  uuid := test_make_user('boss@test.local',   'admin');
  n int;
BEGIN
  -- Alice submits a request
  PERFORM test_set_user(alice);
  INSERT INTO public.punch_edit_requests
    (employee_id, requested_kind, requested_time, reason)
  VALUES
    (alice, 'in', now() - interval '1 hour', 'forgot to punch in');

  -- Alice sees her own
  SELECT count(*) INTO n FROM public.punch_edit_requests WHERE employee_id = alice;
  ASSERT n = 1, format('Alice saw %s of her requests; expected 1', n);

  -- Alice cannot insert for someone else
  BEGIN
    INSERT INTO public.punch_edit_requests
      (employee_id, requested_kind, requested_time, reason)
    VALUES (boss, 'in', now(), 'imposter');
    ASSERT false, 'Alice inserted for boss; RLS broken';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    NULL;
  END;

  -- Alice cannot update her own status to approved
  BEGIN
    UPDATE public.punch_edit_requests
      SET status='approved' WHERE employee_id = alice;
    -- If 0 rows affected, that's also fine (RLS hides the row)
    SELECT count(*) INTO n FROM public.punch_edit_requests
      WHERE employee_id = alice AND status = 'approved';
    ASSERT n = 0, 'Alice approved her own request; RLS broken';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- Admin sees all
  PERFORM test_set_user(boss);
  SELECT count(*) INTO n FROM public.punch_edit_requests;
  ASSERT n >= 1, format('Boss saw %s requests; expected >= 1', n);
END $$;

ROLLBACK;
```

- [ ] **Step 2: Run**

```bash
supabase db reset && \
  psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f tests/rls/edit_requests.test.sql
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add tests/rls/edit_requests.test.sql
git commit -m "test(rls): edit request policies (own/admin/cannot-self-approve)"
```

---

## Phase 3: Edge Functions

### Task 3.1: Shared library — Haversine distance

**Files:**
- Create: `supabase/functions/_shared/haversine.ts`
- Test: inline import via `deno test`

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/haversine.test.ts`:

```ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { haversineMeters } from "./haversine.ts";

Deno.test("haversine: identical points → 0", () => {
  assertEquals(haversineMeters(40, -3, 40, -3), 0);
});

Deno.test("haversine: ~111km per degree of latitude at equator", () => {
  const d = haversineMeters(0, 0, 1, 0);
  assert(Math.abs(d - 111_195) < 100, `got ${d}`);
});

Deno.test("haversine: Madrid Sol → Atocha ~1500m", () => {
  // Sol: 40.4168, -3.7038 ; Atocha: 40.4070, -3.6919
  const d = haversineMeters(40.4168, -3.7038, 40.4070, -3.6919);
  assert(d > 1300 && d < 1700, `expected ~1500m, got ${d}`);
});
```

- [ ] **Step 2: Run, verify fail**

```bash
cd supabase/functions/_shared
deno test --allow-all haversine.test.ts
```

Expected: fails with "Module not found" or similar.

- [ ] **Step 3: Implement**

Create `supabase/functions/_shared/haversine.ts`:

```ts
const R_METERS = 6_371_000;

export function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) ** 2;
  return 2 * R_METERS * Math.asin(Math.sqrt(a));
}
```

- [ ] **Step 4: Run, verify pass**

```bash
deno test --allow-all haversine.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/haversine.ts supabase/functions/_shared/haversine.test.ts
git commit -m "feat(edge): haversine distance helper with tests"
```

---

### Task 3.2: Shared library — Auth helpers

**Files:** Create `supabase/functions/_shared/auth.ts`

- [ ] **Step 1: Write helper**

```ts
// supabase/functions/_shared/auth.ts
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

export interface AuthedUser {
  id: string;
  email: string;
  role: 'employee' | 'admin';
}

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

export async function authenticate(req: Request): Promise<AuthedUser> {
  const header = req.headers.get('Authorization');
  if (!header) throw new HttpError(401, 'MISSING_AUTH');

  const user = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: header } },
  });
  const { data, error } = await user.auth.getUser();
  if (error || !data.user) throw new HttpError(401, 'INVALID_JWT');

  // Look up role from employees
  const admin = adminClient();
  const { data: emp, error: empErr } = await admin
    .from('employees')
    .select('id, email, role, active')
    .eq('id', data.user.id)
    .single();
  if (empErr || !emp) throw new HttpError(403, 'NOT_EMPLOYEE');
  if (!emp.active) throw new HttpError(403, 'INACTIVE');

  return { id: emp.id, email: emp.email, role: emp.role };
}

export function requireAdmin(user: AuthedUser): void {
  if (user.role !== 'admin') throw new HttpError(403, 'NOT_ADMIN');
}

export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, content-type',
    },
  });
}

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    });
  }
  return null;
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return jsonResponse(err.status, { error: err.code, message: err.message });
  }
  console.error('unhandled', err);
  return jsonResponse(500, { error: 'INTERNAL' });
}
```

- [ ] **Step 2: Commit**

(No standalone test here — these are integration-tested by each function's `test.ts`.)

```bash
git add supabase/functions/_shared/auth.ts
git commit -m "feat(edge): shared auth + response helpers"
```

---

### Task 3.3: punch-in — test setup

**Files:** Create `supabase/functions/punch-in/test.ts`

- [ ] **Step 1: Write the test scaffold**

```ts
// supabase/functions/punch-in/test.ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

const SUPABASE_URL      = 'http://127.0.0.1:54321';
const SERVICE_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY          = Deno.env.get('SUPABASE_ANON_KEY')!;
const FUNC_URL          = `${SUPABASE_URL}/functions/v1/punch-in`;
const OFFICE_LAT = 40.416775;
const OFFICE_LNG = -3.703790;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function makeEmployee(email: string): Promise<{ id: string; jwt: string }> {
  // create auth user
  const { data: u, error: uErr } = await admin.auth.admin.createUser({
    email, password: 'test-pw-12345', email_confirm: true,
  });
  if (uErr || !u.user) throw uErr;
  // employees row
  await admin.from('employees').insert({
    id: u.user.id, email, full_name: email.split('@')[0], role: 'employee',
  });
  // get JWT via password login
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error: sErr } = await anon.auth.signInWithPassword({
    email, password: 'test-pw-12345',
  });
  if (sErr || !s.session) throw sErr;
  return { id: u.user.id, jwt: s.session.access_token };
}

async function cleanup() {
  await admin.from('effective_punches').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('punch_edit_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('punches').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('employees').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  // remove all auth users created above
  const { data } = await admin.auth.admin.listUsers();
  for (const u of data?.users ?? []) {
    await admin.auth.admin.deleteUser(u.id);
  }
}

async function callPunchIn(jwt: string, body: unknown): Promise<Response> {
  return await fetch(FUNC_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

Deno.test({
  name: "punch-in: inside geofence + good accuracy → 200",
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const { id, jwt } = await makeEmployee('inside@test.local');
    const res = await callPunchIn(jwt, {
      kind: 'in',
      latitude: OFFICE_LAT,
      longitude: OFFICE_LNG,
      accuracy_m: 20,
    });
    assertEquals(res.status, 200);
    const json = await res.json();
    assert(json.punch_id, 'expected punch_id in response');
    // verify both tables got rows
    const { data: punches } = await admin.from('punches').select('*').eq('employee_id', id);
    const { data: effs } = await admin.from('effective_punches').select('*').eq('employee_id', id);
    assertEquals(punches?.length, 1);
    assertEquals(effs?.length, 1);
    await cleanup();
  },
});
```

- [ ] **Step 2: Run, verify fail (function not deployed yet)**

```bash
supabase functions serve --no-verify-jwt &
sleep 3
SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o json | jq -r .SERVICE_ROLE_KEY) \
SUPABASE_ANON_KEY=$(supabase status -o json | jq -r .ANON_KEY) \
deno test --allow-all supabase/functions/punch-in/test.ts
```

Expected: fails because `punch-in` function doesn't exist yet (404 from functions/v1/punch-in).

Kill the background `supabase functions serve` process (`fg` then `Ctrl-C`, or `kill %1`).

- [ ] **Step 3: Commit the failing test**

```bash
git add supabase/functions/punch-in/test.ts
git commit -m "test(edge): punch-in success case (RED)"
```

---

### Task 3.4: punch-in — implementation (geofence path)

**Files:** Create `supabase/functions/punch-in/index.ts`

- [ ] **Step 1: Write the function**

```ts
// supabase/functions/punch-in/index.ts
import {
  authenticate, adminClient, jsonResponse,
  handleCors, errorResponse, HttpError,
} from "../_shared/auth.ts";
import { haversineMeters } from "../_shared/haversine.ts";

interface PunchBody {
  kind: 'in' | 'out';
  latitude: number;
  longitude: number;
  accuracy_m: number;
}

const MIN_INTERVAL_S    = 60;
const MAX_ACCURACY_M    = 100;

Deno.serve(async (req) => {
  try {
    const cors = handleCors(req);
    if (cors) return cors;
    if (req.method !== 'POST') throw new HttpError(405, 'METHOD');

    const user = await authenticate(req);
    const body = await req.json() as PunchBody;

    if (body.kind !== 'in' && body.kind !== 'out') {
      throw new HttpError(400, 'BAD_KIND');
    }
    if (typeof body.latitude !== 'number' || typeof body.longitude !== 'number') {
      throw new HttpError(400, 'BAD_COORDS');
    }
    if (typeof body.accuracy_m !== 'number' || body.accuracy_m < 0) {
      throw new HttpError(400, 'BAD_ACCURACY');
    }
    if (body.accuracy_m > MAX_ACCURACY_M) {
      throw new HttpError(400, 'LOW_ACCURACY');
    }

    const admin = adminClient();

    // find an office where this position is within radius
    const { data: offices, error: officesErr } = await admin
      .from('office_locations')
      .select('id, latitude, longitude, radius_meters')
      .eq('active', true);
    if (officesErr) throw officesErr;

    const matchingOffice = (offices ?? []).find((o) => {
      const d = haversineMeters(body.latitude, body.longitude, Number(o.latitude), Number(o.longitude));
      return d <= o.radius_meters;
    });
    if (!matchingOffice) throw new HttpError(400, 'OUT_OF_GEOFENCE');

    // dedupe: last punch within MIN_INTERVAL_S?
    const { data: last } = await admin
      .from('punches')
      .select('kind, recorded_at')
      .eq('employee_id', user.id)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (last) {
      const ageMs = Date.now() - new Date(last.recorded_at).getTime();
      if (ageMs < MIN_INTERVAL_S * 1000) throw new HttpError(409, 'TOO_SOON');
      if (last.kind === body.kind) throw new HttpError(409, 'INVALID_SEQUENCE');
    } else if (body.kind === 'out') {
      throw new HttpError(409, 'INVALID_SEQUENCE');
    }

    const userAgent = req.headers.get('user-agent') ?? null;
    const fwdFor = req.headers.get('x-forwarded-for') ?? null;
    const ip = fwdFor?.split(',')[0]?.trim() ?? null;

    const { data: created, error: rpcErr } = await admin.rpc('create_punch', {
      p_employee_id: user.id,
      p_kind:        body.kind,
      p_lat:         body.latitude,
      p_lng:         body.longitude,
      p_accuracy:    body.accuracy_m,
      p_office_id:   matchingOffice.id,
      p_user_agent:  userAgent,
      p_ip:          ip,
    });
    if (rpcErr) throw rpcErr;

    const row = Array.isArray(created) ? created[0] : created;
    return jsonResponse(200, { punch_id: row.id, recorded_at: row.recorded_at });
  } catch (err) {
    return errorResponse(err);
  }
});
```

- [ ] **Step 2: Run test, verify pass**

```bash
supabase functions serve --no-verify-jwt &
sleep 3
SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o json | jq -r .SERVICE_ROLE_KEY) \
SUPABASE_ANON_KEY=$(supabase status -o json | jq -r .ANON_KEY) \
deno test --allow-all supabase/functions/punch-in/test.ts
kill %1
```

Expected: 1 passed.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/punch-in/index.ts
git commit -m "feat(edge): punch-in (GREEN for success case)"
```

---

### Task 3.5: punch-in — geofence/accuracy/sequence failure tests

**Files:** Modify `supabase/functions/punch-in/test.ts`

- [ ] **Step 1: Append failure-case tests**

After the existing `Deno.test` in `punch-in/test.ts`, add:

```ts
Deno.test({ name: "punch-in: outside geofence → 400 OUT_OF_GEOFENCE", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const { jwt } = await makeEmployee('outside@test.local');
    // 1km north of office → outside 200m
    const res = await callPunchIn(jwt, {
      kind: 'in', latitude: OFFICE_LAT + 0.01, longitude: OFFICE_LNG, accuracy_m: 20,
    });
    assertEquals(res.status, 400);
    assertEquals((await res.json()).error, 'OUT_OF_GEOFENCE');
    await cleanup();
  }});

Deno.test({ name: "punch-in: accuracy > 100m → 400 LOW_ACCURACY", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const { jwt } = await makeEmployee('low-acc@test.local');
    const res = await callPunchIn(jwt, {
      kind: 'in', latitude: OFFICE_LAT, longitude: OFFICE_LNG, accuracy_m: 150,
    });
    assertEquals(res.status, 400);
    assertEquals((await res.json()).error, 'LOW_ACCURACY');
    await cleanup();
  }});

Deno.test({ name: "punch-in: duplicate within 60s → 409 TOO_SOON", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const { jwt } = await makeEmployee('dup@test.local');
    const r1 = await callPunchIn(jwt, { kind:'in', latitude: OFFICE_LAT, longitude: OFFICE_LNG, accuracy_m: 20 });
    assertEquals(r1.status, 200);
    const r2 = await callPunchIn(jwt, { kind:'out', latitude: OFFICE_LAT, longitude: OFFICE_LNG, accuracy_m: 20 });
    assertEquals(r2.status, 409);
    assertEquals((await r2.json()).error, 'TOO_SOON');
    await cleanup();
  }});

Deno.test({ name: "punch-in: two consecutive 'in' → 409 INVALID_SEQUENCE", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const { id, jwt } = await makeEmployee('seq@test.local');
    // Backdate first punch so 60s window doesn't trip
    await admin.from('punches').insert({
      employee_id: id, kind: 'in',
      recorded_at: new Date(Date.now() - 5*60*1000).toISOString(),
      latitude: OFFICE_LAT, longitude: OFFICE_LNG,
      office_id: (await admin.from('office_locations').select('id').limit(1).single()).data!.id,
    });
    const res = await callPunchIn(jwt, { kind: 'in', latitude: OFFICE_LAT, longitude: OFFICE_LNG, accuracy_m: 20 });
    assertEquals(res.status, 409);
    assertEquals((await res.json()).error, 'INVALID_SEQUENCE');
    await cleanup();
  }});

Deno.test({ name: "punch-in: missing JWT → 401", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const res = await fetch(FUNC_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind:'in', latitude: OFFICE_LAT, longitude: OFFICE_LNG, accuracy_m: 20 }),
    });
    assertEquals(res.status, 401);
  }});
```

- [ ] **Step 2: Run all punch-in tests**

```bash
supabase functions serve --no-verify-jwt &
sleep 3
SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o json | jq -r .SERVICE_ROLE_KEY) \
SUPABASE_ANON_KEY=$(supabase status -o json | jq -r .ANON_KEY) \
deno test --allow-all supabase/functions/punch-in/test.ts
kill %1
```

Expected: 6 passed (1 from earlier + 5 new).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/punch-in/test.ts
git commit -m "test(edge): punch-in failure modes (geofence, accuracy, dedup, sequence, auth)"
```

---

### Task 3.6: submit-edit-request — TDD

**Files:**
- Create: `supabase/functions/submit-edit-request/test.ts`
- Create: `supabase/functions/submit-edit-request/index.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// supabase/functions/submit-edit-request/test.ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

const SUPABASE_URL  = 'http://127.0.0.1:54321';
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY      = Deno.env.get('SUPABASE_ANON_KEY')!;
const FUNC_URL      = `${SUPABASE_URL}/functions/v1/submit-edit-request`;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function makeEmployee(email: string) {
  const { data: u } = await admin.auth.admin.createUser({
    email, password: 'test-pw-12345', email_confirm: true,
  });
  await admin.from('employees').insert({
    id: u!.user!.id, email, full_name: email.split('@')[0], role: 'employee',
  });
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await anon.auth.signInWithPassword({ email, password: 'test-pw-12345' });
  return { id: u!.user!.id, jwt: s!.session!.access_token };
}

async function cleanup() {
  await admin.from('punch_edit_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('employees').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const { data } = await admin.auth.admin.listUsers();
  for (const u of data?.users ?? []) await admin.auth.admin.deleteUser(u.id);
}

async function submit(jwt: string, body: unknown): Promise<Response> {
  return await fetch(FUNC_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

Deno.test({ name: "submit-edit-request: valid request → 200, row created", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const { id, jwt } = await makeEmployee('emp@test.local');
    const requestedTime = new Date(Date.now() - 60*60*1000).toISOString();
    const res = await submit(jwt, {
      requested_kind: 'in', requested_time: requestedTime, reason: 'forgot',
    });
    assertEquals(res.status, 200);
    const { data: rows } = await admin.from('punch_edit_requests').select('*').eq('employee_id', id);
    assertEquals(rows?.length, 1);
    assertEquals(rows![0].status, 'pending');
    await cleanup();
  }});

Deno.test({ name: "submit-edit-request: future time → 400 FUTURE_TIME", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const { jwt } = await makeEmployee('emp2@test.local');
    const future = new Date(Date.now() + 60*60*1000).toISOString();
    const res = await submit(jwt, { requested_kind: 'in', requested_time: future, reason: 'lol' });
    assertEquals(res.status, 400);
    assertEquals((await res.json()).error, 'FUTURE_TIME');
    await cleanup();
  }});

Deno.test({ name: "submit-edit-request: empty reason → 400 BAD_REASON", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const { jwt } = await makeEmployee('emp3@test.local');
    const res = await submit(jwt, {
      requested_kind: 'in',
      requested_time: new Date(Date.now() - 60_000).toISOString(),
      reason: '',
    });
    assertEquals(res.status, 400);
    assertEquals((await res.json()).error, 'BAD_REASON');
    await cleanup();
  }});
```

- [ ] **Step 2: Run, verify fail**

```bash
supabase functions serve --no-verify-jwt &
sleep 3
SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o json | jq -r .SERVICE_ROLE_KEY) \
SUPABASE_ANON_KEY=$(supabase status -o json | jq -r .ANON_KEY) \
deno test --allow-all supabase/functions/submit-edit-request/test.ts
kill %1
```

Expected: 404 from function URL.

- [ ] **Step 3: Implement**

Create `supabase/functions/submit-edit-request/index.ts`:

```ts
import {
  authenticate, adminClient, jsonResponse,
  handleCors, errorResponse, HttpError,
} from "../_shared/auth.ts";

interface Body {
  requested_kind: 'in' | 'out';
  requested_time: string;        // ISO timestamp
  reason: string;
  original_punch_id?: string;
}

Deno.serve(async (req) => {
  try {
    const cors = handleCors(req);
    if (cors) return cors;
    if (req.method !== 'POST') throw new HttpError(405, 'METHOD');

    const user = await authenticate(req);
    const body = await req.json() as Body;

    if (body.requested_kind !== 'in' && body.requested_kind !== 'out')
      throw new HttpError(400, 'BAD_KIND');
    if (typeof body.reason !== 'string' || body.reason.trim().length === 0)
      throw new HttpError(400, 'BAD_REASON');

    const when = new Date(body.requested_time);
    if (isNaN(when.getTime())) throw new HttpError(400, 'BAD_TIME');
    if (when.getTime() > Date.now()) throw new HttpError(400, 'FUTURE_TIME');

    const admin = adminClient();
    const { error } = await admin.from('punch_edit_requests').insert({
      employee_id:       user.id,
      original_punch_id: body.original_punch_id ?? null,
      requested_kind:    body.requested_kind,
      requested_time:    when.toISOString(),
      reason:            body.reason.trim(),
    });
    if (error) throw error;

    return jsonResponse(200, { ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});
```

- [ ] **Step 4: Run, verify pass**

```bash
supabase functions serve --no-verify-jwt &
sleep 3
SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o json | jq -r .SERVICE_ROLE_KEY) \
SUPABASE_ANON_KEY=$(supabase status -o json | jq -r .ANON_KEY) \
deno test --allow-all supabase/functions/submit-edit-request/test.ts
kill %1
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/submit-edit-request/
git commit -m "feat(edge): submit-edit-request with reason/time validation"
```

---

### Task 3.7: approve-edit — TDD

**Files:**
- Create: `supabase/functions/approve-edit/test.ts`
- Create: `supabase/functions/approve-edit/index.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// supabase/functions/approve-edit/test.ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;
const FUNC_URL     = `${SUPABASE_URL}/functions/v1/approve-edit`;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function makeUser(email: string, role: 'employee' | 'admin') {
  const { data: u } = await admin.auth.admin.createUser({
    email, password: 'test-pw-12345', email_confirm: true,
  });
  await admin.from('employees').insert({
    id: u!.user!.id, email, full_name: email.split('@')[0], role,
  });
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await anon.auth.signInWithPassword({ email, password: 'test-pw-12345' });
  return { id: u!.user!.id, jwt: s!.session!.access_token };
}

async function cleanup() {
  await admin.from('effective_punches').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('punch_edit_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('employees').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const { data } = await admin.auth.admin.listUsers();
  for (const u of data?.users ?? []) await admin.auth.admin.deleteUser(u.id);
}

async function makePendingRequest(employeeId: string) {
  const { data, error } = await admin.from('punch_edit_requests').insert({
    employee_id: employeeId,
    requested_kind: 'in',
    requested_time: new Date(Date.now() - 60*60*1000).toISOString(),
    reason: 'forgot',
  }).select('id').single();
  if (error) throw error;
  return data.id;
}

async function call(jwt: string, requestId: string, note = 'ok') {
  return fetch(FUNC_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ request_id: requestId, note }),
  });
}

Deno.test({ name: "approve-edit: admin approves → 200, effective_punches +1, status=approved", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const emp   = await makeUser('emp@test.local', 'employee');
    const boss  = await makeUser('boss@test.local', 'admin');
    const reqId = await makePendingRequest(emp.id);

    const res = await call(boss.jwt, reqId);
    assertEquals(res.status, 200);

    const { data: req } = await admin.from('punch_edit_requests').select('status,reviewed_by').eq('id', reqId).single();
    assertEquals(req!.status, 'approved');
    assertEquals(req!.reviewed_by, boss.id);

    const { data: effs } = await admin.from('effective_punches').select('*').eq('source_request_id', reqId);
    assertEquals(effs?.length, 1);
    await cleanup();
  }});

Deno.test({ name: "approve-edit: non-admin → 403 NOT_ADMIN", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const emp   = await makeUser('emp2@test.local', 'employee');
    const reqId = await makePendingRequest(emp.id);
    const res = await call(emp.jwt, reqId);
    assertEquals(res.status, 403);
    assertEquals((await res.json()).error, 'NOT_ADMIN');
    await cleanup();
  }});

Deno.test({ name: "approve-edit: already approved → 409 ALREADY_DECIDED", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const emp  = await makeUser('emp3@test.local', 'employee');
    const boss = await makeUser('boss3@test.local', 'admin');
    const reqId = await makePendingRequest(emp.id);
    const r1 = await call(boss.jwt, reqId);
    assertEquals(r1.status, 200);
    const r2 = await call(boss.jwt, reqId);
    assertEquals(r2.status, 409);
    assertEquals((await r2.json()).error, 'ALREADY_DECIDED');
    await cleanup();
  }});
```

- [ ] **Step 2: Run, verify fail (404)**

```bash
supabase functions serve --no-verify-jwt &
sleep 3
SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o json | jq -r .SERVICE_ROLE_KEY) \
SUPABASE_ANON_KEY=$(supabase status -o json | jq -r .ANON_KEY) \
deno test --allow-all supabase/functions/approve-edit/test.ts
kill %1
```

- [ ] **Step 3: Implement**

```ts
// supabase/functions/approve-edit/index.ts
import {
  authenticate, requireAdmin, adminClient, jsonResponse,
  handleCors, errorResponse, HttpError,
} from "../_shared/auth.ts";

interface Body { request_id: string; note?: string }

Deno.serve(async (req) => {
  try {
    const cors = handleCors(req);
    if (cors) return cors;
    if (req.method !== 'POST') throw new HttpError(405, 'METHOD');

    const user = await authenticate(req);
    requireAdmin(user);

    const body = await req.json() as Body;
    if (!body.request_id) throw new HttpError(400, 'BAD_REQUEST_ID');

    const admin = adminClient();
    const { error } = await admin.rpc('approve_edit_request', {
      p_request_id:  body.request_id,
      p_reviewer_id: user.id,
      p_note:        body.note ?? '',
    });
    if (error) {
      // map Postgres SQLSTATE → HTTP
      if (error.code === 'P0001') throw new HttpError(409, 'ALREADY_DECIDED');
      if (error.code === 'P0002') throw new HttpError(404, 'NOT_FOUND');
      throw error;
    }

    return jsonResponse(200, { ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});
```

- [ ] **Step 4: Run, verify pass**

```bash
supabase functions serve --no-verify-jwt &
sleep 3
SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o json | jq -r .SERVICE_ROLE_KEY) \
SUPABASE_ANON_KEY=$(supabase status -o json | jq -r .ANON_KEY) \
deno test --allow-all supabase/functions/approve-edit/test.ts
kill %1
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/approve-edit/
git commit -m "feat(edge): approve-edit with admin guard and idempotency"
```

---

### Task 3.8: reject-edit — TDD

**Files:**
- Create: `supabase/functions/reject-edit/test.ts`
- Create: `supabase/functions/reject-edit/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/reject-edit/test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;
const FUNC_URL     = `${SUPABASE_URL}/functions/v1/reject-edit`;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function makeUser(email: string, role: 'employee' | 'admin') {
  const { data: u } = await admin.auth.admin.createUser({
    email, password: 'test-pw-12345', email_confirm: true,
  });
  await admin.from('employees').insert({
    id: u!.user!.id, email, full_name: email.split('@')[0], role,
  });
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await anon.auth.signInWithPassword({ email, password: 'test-pw-12345' });
  return { id: u!.user!.id, jwt: s!.session!.access_token };
}
async function cleanup() {
  await admin.from('effective_punches').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('punch_edit_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('employees').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const { data } = await admin.auth.admin.listUsers();
  for (const u of data?.users ?? []) await admin.auth.admin.deleteUser(u.id);
}

Deno.test({ name: "reject-edit: admin rejects → 200, status=rejected, no effective row", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const emp  = await makeUser('emp@test.local', 'employee');
    const boss = await makeUser('boss@test.local', 'admin');
    const { data: r } = await admin.from('punch_edit_requests').insert({
      employee_id: emp.id, requested_kind: 'in',
      requested_time: new Date(Date.now() - 3600_000).toISOString(),
      reason: 'forgot',
    }).select('id').single();
    const reqId = r!.id;

    const res = await fetch(FUNC_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${boss.jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: reqId, note: 'not approved' }),
    });
    assertEquals(res.status, 200);

    const { data: req } = await admin.from('punch_edit_requests').select('status').eq('id', reqId).single();
    assertEquals(req!.status, 'rejected');
    const { data: effs } = await admin.from('effective_punches').select('*').eq('source_request_id', reqId);
    assertEquals(effs?.length, 0);
    await cleanup();
  }});
```

- [ ] **Step 2: Run, verify fail**

```bash
supabase functions serve --no-verify-jwt &
sleep 3
SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o json | jq -r .SERVICE_ROLE_KEY) \
SUPABASE_ANON_KEY=$(supabase status -o json | jq -r .ANON_KEY) \
deno test --allow-all supabase/functions/reject-edit/test.ts
kill %1
```

- [ ] **Step 3: Implement**

```ts
// supabase/functions/reject-edit/index.ts
import {
  authenticate, requireAdmin, adminClient, jsonResponse,
  handleCors, errorResponse, HttpError,
} from "../_shared/auth.ts";

interface Body { request_id: string; note?: string }

Deno.serve(async (req) => {
  try {
    const cors = handleCors(req);
    if (cors) return cors;
    if (req.method !== 'POST') throw new HttpError(405, 'METHOD');

    const user = await authenticate(req);
    requireAdmin(user);

    const body = await req.json() as Body;
    if (!body.request_id) throw new HttpError(400, 'BAD_REQUEST_ID');

    const admin = adminClient();
    const { error } = await admin.rpc('reject_edit_request', {
      p_request_id:  body.request_id,
      p_reviewer_id: user.id,
      p_note:        body.note ?? '',
    });
    if (error) {
      if (error.code === 'P0001') throw new HttpError(409, 'ALREADY_DECIDED');
      if (error.code === 'P0002') throw new HttpError(404, 'NOT_FOUND');
      throw error;
    }

    return jsonResponse(200, { ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});
```

- [ ] **Step 4: Run, verify pass**

```bash
supabase functions serve --no-verify-jwt &
sleep 3
SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o json | jq -r .SERVICE_ROLE_KEY) \
SUPABASE_ANON_KEY=$(supabase status -o json | jq -r .ANON_KEY) \
deno test --allow-all supabase/functions/reject-edit/test.ts
kill %1
```

Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/reject-edit/
git commit -m "feat(edge): reject-edit"
```

---

### Task 3.9: export-month — TDD

**Files:**
- Create: `supabase/functions/export-month/test.ts`
- Create: `supabase/functions/export-month/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/export-month/test.ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;
const FUNC_URL     = `${SUPABASE_URL}/functions/v1/export-month`;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function makeUser(email: string, role: 'employee' | 'admin') {
  const { data: u } = await admin.auth.admin.createUser({
    email, password: 'test-pw-12345', email_confirm: true,
  });
  await admin.from('employees').insert({
    id: u!.user!.id, email, full_name: email.split('@')[0], role,
  });
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await anon.auth.signInWithPassword({ email, password: 'test-pw-12345' });
  return { id: u!.user!.id, jwt: s!.session!.access_token };
}
async function cleanup() {
  await admin.from('effective_punches').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('punch_edit_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('punches').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('employees').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const { data } = await admin.auth.admin.listUsers();
  for (const u of data?.users ?? []) await admin.auth.admin.deleteUser(u.id);
}

Deno.test({ name: "export-month: admin → CSV with header and rows", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const emp  = await makeUser('emp@test.local', 'employee');
    const boss = await makeUser('boss@test.local', 'admin');
    const office = (await admin.from('office_locations').select('id').limit(1).single()).data!.id;

    // 1 paired punch
    const t0 = new Date('2026-05-05T09:00:00Z');
    const t1 = new Date('2026-05-05T17:00:00Z');
    const { data: p1 } = await admin.from('punches').insert({
      employee_id: emp.id, kind: 'in', recorded_at: t0.toISOString(),
      latitude: 40.4, longitude: -3.7, office_id: office,
    }).select('id').single();
    const { data: p2 } = await admin.from('punches').insert({
      employee_id: emp.id, kind: 'out', recorded_at: t1.toISOString(),
      latitude: 40.4, longitude: -3.7, office_id: office,
    }).select('id').single();
    await admin.from('effective_punches').insert([
      { employee_id: emp.id, kind: 'in',  effective_time: t0.toISOString(), source_punch_id: p1!.id },
      { employee_id: emp.id, kind: 'out', effective_time: t1.toISOString(), source_punch_id: p2!.id },
    ]);

    const url = new URL(FUNC_URL);
    url.searchParams.set('month', '2026-05');
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${boss.jwt}` },
    });
    assertEquals(res.status, 200);
    assertEquals(res.headers.get('content-type'), 'text/csv; charset=utf-8');
    const csv = await res.text();
    assert(csv.includes('employee_email'), 'expected header');
    assert(csv.includes('emp@test.local'), 'expected employee row');
    assert(csv.includes('2026-05-05'), 'expected the work date');
    await cleanup();
  }});

Deno.test({ name: "export-month: employee → only sees own rows", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const alice = await makeUser('alice@test.local', 'employee');
    const bob   = await makeUser('bob@test.local',   'employee');
    const office = (await admin.from('office_locations').select('id').limit(1).single()).data!.id;
    const t0 = new Date('2026-05-05T09:00:00Z');
    const t1 = new Date('2026-05-05T17:00:00Z');
    for (const emp of [alice, bob]) {
      const { data: pi } = await admin.from('punches').insert({
        employee_id: emp.id, kind: 'in', recorded_at: t0.toISOString(),
        latitude: 40.4, longitude: -3.7, office_id: office,
      }).select('id').single();
      const { data: po } = await admin.from('punches').insert({
        employee_id: emp.id, kind: 'out', recorded_at: t1.toISOString(),
        latitude: 40.4, longitude: -3.7, office_id: office,
      }).select('id').single();
      await admin.from('effective_punches').insert([
        { employee_id: emp.id, kind: 'in',  effective_time: t0.toISOString(), source_punch_id: pi!.id },
        { employee_id: emp.id, kind: 'out', effective_time: t1.toISOString(), source_punch_id: po!.id },
      ]);
    }

    const url = new URL(FUNC_URL);
    url.searchParams.set('month', '2026-05');
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${alice.jwt}` } });
    const csv = await res.text();
    assert(csv.includes('alice@test.local'));
    assert(!csv.includes('bob@test.local'), 'employee should not see other employees');
    await cleanup();
  }});
```

- [ ] **Step 2: Run, verify fail**

```bash
supabase functions serve --no-verify-jwt &
sleep 3
SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o json | jq -r .SERVICE_ROLE_KEY) \
SUPABASE_ANON_KEY=$(supabase status -o json | jq -r .ANON_KEY) \
deno test --allow-all supabase/functions/export-month/test.ts
kill %1
```

- [ ] **Step 3: Implement**

```ts
// supabase/functions/export-month/index.ts
import {
  authenticate, adminClient, handleCors, errorResponse, HttpError,
} from "../_shared/auth.ts";

function csvEscape(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function formatMadrid(d: Date): { date: string; time: string } {
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)!.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}:${get('second')}`,
  };
}

Deno.serve(async (req) => {
  try {
    const cors = handleCors(req);
    if (cors) return cors;
    if (req.method !== 'GET') throw new HttpError(405, 'METHOD');

    const user = await authenticate(req);
    const url = new URL(req.url);
    const month = url.searchParams.get('month');
    if (!month || !/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, 'BAD_MONTH');

    const [y, m] = month.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));   // start of month UTC
    const end   = new Date(Date.UTC(y, m,     1, 0, 0, 0));

    const admin = adminClient();

    let query = admin
      .from('effective_punches')
      .select('employee_id, kind, effective_time, employees(email, full_name)')
      .gte('effective_time', start.toISOString())
      .lt('effective_time', end.toISOString())
      .order('effective_time', { ascending: true });
    if (user.role !== 'admin') {
      query = query.eq('employee_id', user.id);
    }

    const { data: rows, error } = await query;
    if (error) throw error;

    const lines: string[] = [
      ['employee_email', 'employee_name', 'work_date', 'kind', 'time_local', 'time_utc'].join(','),
    ];
    for (const r of rows ?? []) {
      const t = new Date(r.effective_time as string);
      const { date, time } = formatMadrid(t);
      const emp = (r as any).employees;
      lines.push([
        csvEscape(emp.email),
        csvEscape(emp.full_name),
        date,
        r.kind as string,
        time,
        t.toISOString(),
      ].join(','));
    }
    const csv = lines.join('\n') + '\n';

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="punches-${month}.csv"`,
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
});
```

- [ ] **Step 4: Run, verify pass**

```bash
supabase functions serve --no-verify-jwt &
sleep 3
SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o json | jq -r .SERVICE_ROLE_KEY) \
SUPABASE_ANON_KEY=$(supabase status -o json | jq -r .ANON_KEY) \
deno test --allow-all supabase/functions/export-month/test.ts
kill %1
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/export-month/
git commit -m "feat(edge): export-month CSV with Europe/Madrid times"
```

---

## Phase 4: Frontend Foundation

### Task 4.1: Supabase client + types

**Files:**
- Create: `src/lib/supabase.ts`, `src/lib/types.ts`

- [ ] **Step 1: Write the client**

```ts
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const url     = import.meta.env.VITE_SUPABASE_URL!;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});

// Expose to window in dev mode so Playwright tests can sign in directly.
if (import.meta.env.DEV) {
  (window as unknown as { supabase: typeof supabase }).supabase = supabase;
}
```

- [ ] **Step 2: Write shared types**

```ts
// src/lib/types.ts
export interface Employee {
  id: string;
  email: string;
  full_name: string;
  role: 'employee' | 'admin';
  active: boolean;
}

export interface Punch {
  id: string;
  employee_id: string;
  kind: 'in' | 'out';
  recorded_at: string;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  office_id: string;
}

export interface EffectivePunch {
  id: string;
  employee_id: string;
  kind: 'in' | 'out';
  effective_time: string;
  source_punch_id: string | null;
  source_request_id: string | null;
}

export interface PunchEditRequest {
  id: string;
  employee_id: string;
  original_punch_id: string | null;
  requested_kind: 'in' | 'out';
  requested_time: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase.ts src/lib/types.ts
git commit -m "feat(fe): supabase client + shared types"
```

---

### Task 4.2: Auth — magic link login

**Files:**
- Create: `src/auth/AuthProvider.tsx`, `src/auth/useAuth.ts`, `src/auth/LoginPage.tsx`, `src/auth/AuthCallback.tsx`, `src/auth/RequireAuth.tsx`

- [ ] **Step 1: AuthProvider**

```tsx
// src/auth/AuthProvider.tsx
import { createContext, useEffect, useState, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Employee } from '../lib/types';

interface Ctx {
  session: Session | null;
  profile: Employee | null;
  loading: boolean;
}

export const AuthContext = createContext<Ctx>({ session: null, profile: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!session) { setProfile(null); setLoading(false); return; }
    setLoading(true);
    supabase.from('employees').select('*').eq('id', session.user.id).single()
      .then(({ data }) => { setProfile(data as Employee | null); setLoading(false); });
  }, [session]);

  return <AuthContext.Provider value={{ session, profile, loading }}>{children}</AuthContext.Provider>;
}
```

- [ ] **Step 2: useAuth hook**

```ts
// src/auth/useAuth.ts
import { useContext } from 'react';
import { AuthContext } from './AuthProvider';

export function useAuth() {
  return useContext(AuthContext);
}
```

- [ ] **Step 3: LoginPage**

```tsx
// src/auth/LoginPage.tsx
import { useState } from 'react';
import { supabase } from '../lib/supabase';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending'); setError('');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) { setStatus('error'); setError(error.message); }
    else setStatus('sent');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={submit} className="bg-white p-8 rounded shadow w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold">登录</h1>
        <input
          type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          className="w-full px-3 py-2 border rounded"
        />
        <button
          type="submit" disabled={status === 'sending'}
          className="w-full py-2 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          {status === 'sending' ? '发送中…' : '发送魔法链接'}
        </button>
        {status === 'sent' && <p className="text-green-700">查收邮箱并点击链接登录。</p>}
        {status === 'error' && <p className="text-red-700">{error}</p>}
      </form>
    </div>
  );
}
```

- [ ] **Step 4: AuthCallback (handles magic link return)**

```tsx
// src/auth/AuthCallback.tsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export function AuthCallback() {
  const nav = useNavigate();
  useEffect(() => {
    // Supabase JS auto-handles the hash; just wait then redirect
    supabase.auth.getSession().then(() => nav('/', { replace: true }));
  }, [nav]);
  return <div className="p-8">登录中…</div>;
}
```

- [ ] **Step 5: RequireAuth (route guard)**

```tsx
// src/auth/RequireAuth.tsx
import { Navigate } from 'react-router-dom';
import { ReactNode } from 'react';
import { useAuth } from './useAuth';

interface Props { children: ReactNode; adminOnly?: boolean }

export function RequireAuth({ children, adminOnly }: Props) {
  const { session, profile, loading } = useAuth();
  if (loading) return <div className="p-8">加载中…</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile) return <div className="p-8">账号未在系统注册，请联系管理员。</div>;
  if (adminOnly && profile.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/auth/
git commit -m "feat(fe): magic link auth + route guard"
```

---

### Task 4.3: Router and App shell

**Files:** Modify `src/App.tsx`, `src/main.tsx`; Create `src/router.tsx`

- [ ] **Step 1: Router**

```tsx
// src/router.tsx
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoginPage } from './auth/LoginPage';
import { AuthCallback } from './auth/AuthCallback';
import { RequireAuth } from './auth/RequireAuth';
import { EmployeeHome } from './employee/EmployeeHome';
import { EmployeeHistory } from './employee/EmployeeHistory';
import { SubmitEditRequest } from './employee/SubmitEditRequest';
import { AdminDashboard } from './admin/AdminDashboard';
import { AdminApprovals } from './admin/AdminApprovals';
import { AdminExport } from './admin/AdminExport';

export const router = createBrowserRouter([
  { path: '/login',          element: <LoginPage /> },
  { path: '/auth/callback',  element: <AuthCallback /> },
  { path: '/',               element: <RequireAuth><EmployeeHome /></RequireAuth> },
  { path: '/history',        element: <RequireAuth><EmployeeHistory /></RequireAuth> },
  { path: '/submit-edit',    element: <RequireAuth><SubmitEditRequest /></RequireAuth> },
  { path: '/admin',          element: <RequireAuth adminOnly><AdminDashboard /></RequireAuth> },
  { path: '/admin/approvals', element: <RequireAuth adminOnly><AdminApprovals /></RequireAuth> },
  { path: '/admin/export',   element: <RequireAuth adminOnly><AdminExport /></RequireAuth> },
  { path: '*',               element: <Navigate to="/" replace /> },
]);
```

- [ ] **Step 2: App and main**

Replace `src/App.tsx`:

```tsx
// src/App.tsx
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { router } from './router';

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
```

`src/main.tsx` should be (Vite default produces this; verify):

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
```

- [ ] **Step 3: Create placeholder pages so dev server compiles**

Create these as one-line stubs (real implementations come in Phases 5–6):

```tsx
// src/employee/EmployeeHome.tsx
export function EmployeeHome() { return <div className="p-8">EmployeeHome</div>; }
```

```tsx
// src/employee/EmployeeHistory.tsx
export function EmployeeHistory() { return <div className="p-8">EmployeeHistory</div>; }
```

```tsx
// src/employee/SubmitEditRequest.tsx
export function SubmitEditRequest() { return <div className="p-8">SubmitEditRequest</div>; }
```

```tsx
// src/admin/AdminDashboard.tsx
export function AdminDashboard() { return <div className="p-8">AdminDashboard</div>; }
```

```tsx
// src/admin/AdminApprovals.tsx
export function AdminApprovals() { return <div className="p-8">AdminApprovals</div>; }
```

```tsx
// src/admin/AdminExport.tsx
export function AdminExport() { return <div className="p-8">AdminExport</div>; }
```

- [ ] **Step 4: Run dev server, verify boot**

```bash
npm run dev
```

Open http://localhost:5173 — should redirect to `/login`.

Stop the server.

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "feat(fe): router + auth-gated page stubs"
```

---

### Task 4.4: API wrappers and geolocation helper

**Files:** Create `src/lib/api.ts`, `src/lib/geolocation.ts`, `src/lib/time.ts`

- [ ] **Step 1: API wrappers**

```ts
// src/lib/api.ts
import { supabase } from './supabase';

interface PunchInArgs {
  kind: 'in' | 'out';
  latitude: number;
  longitude: number;
  accuracy_m: number;
}

export interface ApiError {
  status: number;
  code: string;
  message: string;
}

async function invoke<T>(name: string, body: unknown, method: 'POST' | 'GET' = 'POST', searchParams?: Record<string, string>): Promise<T> {
  // For POST we use supabase.functions.invoke; for GET we hand-build the URL.
  if (method === 'POST') {
    const { data, error } = await supabase.functions.invoke<T>(name, { body });
    if (error) {
      const status = (error as any).context?.status ?? 500;
      const json = (error as any).context?.json;
      throw { status, code: json?.error ?? 'UNKNOWN', message: json?.message ?? error.message } as ApiError;
    }
    return data as T;
  } else {
    const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`);
    if (searchParams) for (const [k, v] of Object.entries(searchParams)) url.searchParams.set(k, v);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${session?.access_token}` },
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw { status: res.status, code: json.error ?? 'UNKNOWN', message: json.message ?? res.statusText } as ApiError;
    }
    return await res.text() as unknown as T;
  }
}

export function punchIn(args: PunchInArgs) {
  return invoke<{ punch_id: string; recorded_at: string }>('punch-in', args);
}

export function submitEditRequest(args: {
  requested_kind: 'in' | 'out';
  requested_time: string;
  reason: string;
  original_punch_id?: string;
}) {
  return invoke<{ ok: true }>('submit-edit-request', args);
}

export function approveEdit(request_id: string, note: string) {
  return invoke<{ ok: true }>('approve-edit', { request_id, note });
}

export function rejectEdit(request_id: string, note: string) {
  return invoke<{ ok: true }>('reject-edit', { request_id, note });
}

export function exportMonthCsv(month: string) {
  return invoke<string>('export-month', null, 'GET', { month });
}
```

- [ ] **Step 2: Geolocation**

```ts
// src/lib/geolocation.ts
export interface Coords {
  latitude: number;
  longitude: number;
  accuracy_m: number;
}

export function getPosition(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('NO_GEOLOCATION'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy_m: pos.coords.accuracy,
      }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) reject(new Error('PERMISSION_DENIED'));
        else if (err.code === err.POSITION_UNAVAILABLE) reject(new Error('UNAVAILABLE'));
        else if (err.code === err.TIMEOUT) reject(new Error('TIMEOUT'));
        else reject(err);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    );
  });
}
```

- [ ] **Step 3: Time formatting**

```ts
// src/lib/time.ts
const dateFmt = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
});
const timeFmt = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});
const dtFmt = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

export const formatDate = (iso: string) => dateFmt.format(new Date(iso));
export const formatTime = (iso: string) => timeFmt.format(new Date(iso));
export const formatDateTime = (iso: string) => dtFmt.format(new Date(iso));

export function currentMonthKey(): string {
  // YYYY-MM in Europe/Madrid
  const now = new Date();
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit',
  }).formatToParts(now);
  const y = parts.find(p => p.type === 'year')!.value;
  const m = parts.find(p => p.type === 'month')!.value;
  return `${y}-${m}`;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/
git commit -m "feat(fe): api wrappers, geolocation helper, time formatters"
```

---

## Phase 5: Employee Features

### Task 5.1: PunchButton component

**Files:**
- Create: `src/components/PunchButton.tsx`, `src/components/ErrorBanner.tsx`, `src/components/Spinner.tsx`

- [ ] **Step 1: Spinner**

```tsx
// src/components/Spinner.tsx
export function Spinner() {
  return <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />;
}
```

- [ ] **Step 2: ErrorBanner**

```tsx
// src/components/ErrorBanner.tsx
export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="bg-red-50 border border-red-300 text-red-800 px-4 py-2 rounded">{message}</div>;
}
```

- [ ] **Step 3: PunchButton**

```tsx
// src/components/PunchButton.tsx
import { useState } from 'react';
import { punchIn } from '../lib/api';
import { getPosition } from '../lib/geolocation';
import { Spinner } from './Spinner';

const ERR_LABELS: Record<string, string> = {
  PERMISSION_DENIED:   '需要位置权限才能打卡。请在浏览器设置里允许后重试。',
  UNAVAILABLE:         '无法获取定位。请到窗边或开启 GPS 后重试。',
  TIMEOUT:             '定位超时，请重试。',
  OUT_OF_GEOFENCE:     '你不在办公地范围内，无法打卡。',
  LOW_ACCURACY:        '定位精度不足，请到窗边或室外重试。',
  TOO_SOON:            '刚打过卡了，请稍等一会再试。',
  INVALID_SEQUENCE:    '打卡顺序不对（上班/下班）。如有问题请提交补卡申请。',
  MISSING_AUTH:        '请重新登录。',
  INVALID_JWT:         '请重新登录。',
  NOT_EMPLOYEE:        '账号未在系统注册，请联系管理员。',
};

interface Props {
  kind: 'in' | 'out';
  onSuccess: () => void;
}

export function PunchButton({ kind, onSuccess }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);

  async function go() {
    setBusy(true); setErr(null);
    try {
      const coords = await getPosition();
      await punchIn({ kind, ...coords });
      onSuccess();
    } catch (e: any) {
      const code = e?.code ?? e?.message ?? 'UNKNOWN';
      setErr(ERR_LABELS[code] ?? `打卡失败：${code}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button onClick={go} disabled={busy}
        className={`w-full py-4 text-white font-semibold rounded ${kind === 'in' ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-600 hover:bg-amber-700'} disabled:opacity-50`}>
        {busy ? <Spinner /> : (kind === 'in' ? '上班打卡' : '下班打卡')}
      </button>
      {err && <div className="text-red-700 text-sm">{err}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/
git commit -m "feat(fe): PunchButton with GPS + error mapping"
```

---

### Task 5.2: EmployeeHome — punch page with today's status

**Files:** Modify `src/employee/EmployeeHome.tsx`

- [ ] **Step 1: Replace stub with real component**

```tsx
// src/employee/EmployeeHome.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';
import { PunchButton } from '../components/PunchButton';
import { formatTime, formatDate } from '../lib/time';
import type { EffectivePunch } from '../lib/types';

function todayWindowMadrid(): { start: string; end: string } {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === 'year')!.value;
  const m = parts.find(p => p.type === 'month')!.value;
  const d = parts.find(p => p.type === 'day')!.value;
  // Madrid local day boundaries → UTC by converting via Date
  // Use a sentinel local time and let Date interpret it
  const start = new Date(`${y}-${m}-${d}T00:00:00+02:00`);  // CEST; close enough for one-day window
  const end   = new Date(start.getTime() + 24*60*60*1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function EmployeeHome() {
  const { profile } = useAuth();
  const [today, setToday] = useState<EffectivePunch[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!profile) return;
    setLoading(true);
    const { start, end } = todayWindowMadrid();
    const { data } = await supabase
      .from('effective_punches')
      .select('*')
      .eq('employee_id', profile.id)
      .gte('effective_time', start)
      .lt('effective_time', end)
      .order('effective_time', { ascending: true });
    setToday((data as EffectivePunch[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [profile?.id]);

  const lastKind = today[today.length - 1]?.kind;
  const nextKind: 'in' | 'out' = lastKind === 'in' ? 'out' : 'in';

  return (
    <div className="max-w-md mx-auto p-6 space-y-6">
      <header>
        <div className="text-sm text-gray-600">{profile?.full_name}</div>
        <div className="text-2xl font-semibold">{formatDate(new Date().toISOString())}</div>
      </header>

      <PunchButton kind={nextKind} onSuccess={load} />

      <section>
        <h2 className="font-medium mb-2">今天</h2>
        {loading ? <div>加载中…</div> :
          today.length === 0 ? <div className="text-gray-500">还没打卡</div> :
          <ul className="divide-y border rounded bg-white">
            {today.map(p => (
              <li key={p.id} className="px-4 py-2 flex justify-between">
                <span>{p.kind === 'in' ? '上班' : '下班'}</span>
                <span>{formatTime(p.effective_time)}</span>
              </li>
            ))}
          </ul>}
      </section>

      <nav className="flex gap-4 text-sm text-blue-700 underline">
        <Link to="/history">我的历史</Link>
        <Link to="/submit-edit">补卡申请</Link>
        {profile?.role === 'admin' && <Link to="/admin">管理</Link>}
      </nav>
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

```bash
npm run dev
```

In one terminal:
```bash
supabase functions serve --no-verify-jwt
```

In browser: login as a seeded employee, accept location permission near office coords (or use browser DevTools → Sensors → custom location set to 40.416775, -3.703790). Click "上班打卡" — should see success and the entry appear in "今天".

Manual smoke test only; automated coverage is in E2E (Phase 7).

- [ ] **Step 3: Commit**

```bash
git add src/employee/EmployeeHome.tsx
git commit -m "feat(fe): employee home with punch + today list"
```

---

### Task 5.3: EmployeeHistory

**Files:** Modify `src/employee/EmployeeHistory.tsx`

- [ ] **Step 1: Implementation**

```tsx
// src/employee/EmployeeHistory.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';
import { formatDateTime } from '../lib/time';
import type { EffectivePunch } from '../lib/types';

export function EmployeeHistory() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<EffectivePunch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    const since = new Date(Date.now() - 30*24*60*60*1000).toISOString();
    supabase.from('effective_punches')
      .select('*').eq('employee_id', profile.id)
      .gte('effective_time', since)
      .order('effective_time', { ascending: false })
      .then(({ data }) => { setRows((data as EffectivePunch[]) ?? []); setLoading(false); });
  }, [profile?.id]);

  return (
    <div className="max-w-md mx-auto p-6 space-y-4">
      <Link to="/" className="text-blue-700 underline text-sm">← 返回</Link>
      <h1 className="text-xl font-semibold">最近 30 天</h1>
      {loading ? <div>加载中…</div> :
        rows.length === 0 ? <div className="text-gray-500">暂无记录</div> :
        <ul className="divide-y border rounded bg-white">
          {rows.map(r => (
            <li key={r.id} className="px-4 py-2 flex justify-between">
              <span>{r.kind === 'in' ? '上班' : '下班'}</span>
              <span className="text-gray-700">{formatDateTime(r.effective_time)}</span>
            </li>
          ))}
        </ul>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/employee/EmployeeHistory.tsx
git commit -m "feat(fe): employee history page"
```

---

### Task 5.4: SubmitEditRequest

**Files:** Modify `src/employee/SubmitEditRequest.tsx`

- [ ] **Step 1: Implementation**

```tsx
// src/employee/SubmitEditRequest.tsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { submitEditRequest, ApiError } from '../lib/api';

export function SubmitEditRequest() {
  const nav = useNavigate();
  const [kind, setKind] = useState<'in' | 'out'>('in');
  const [datetime, setDatetime] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      // datetime-local is in user's local TZ; convert to ISO (browser does this)
      const iso = new Date(datetime).toISOString();
      await submitEditRequest({ requested_kind: kind, requested_time: iso, reason });
      nav('/', { replace: true });
    } catch (e: any) {
      const err = e as ApiError;
      const labels: Record<string, string> = {
        FUTURE_TIME: '时间不能是未来。',
        BAD_REASON:  '原因不能为空。',
        BAD_TIME:    '时间格式不正确。',
        BAD_KIND:    '类型不正确。',
      };
      setErr(labels[err.code] ?? `提交失败：${err.code}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto p-6 space-y-4">
      <Link to="/" className="text-blue-700 underline text-sm">← 返回</Link>
      <h1 className="text-xl font-semibold">补卡申请</h1>
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="text-sm">类型</span>
          <select value={kind} onChange={e => setKind(e.target.value as 'in' | 'out')}
            className="w-full px-3 py-2 border rounded">
            <option value="in">上班</option>
            <option value="out">下班</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm">实际时间</span>
          <input type="datetime-local" required value={datetime} onChange={e => setDatetime(e.target.value)}
            className="w-full px-3 py-2 border rounded" />
        </label>
        <label className="block">
          <span className="text-sm">原因</span>
          <textarea required value={reason} onChange={e => setReason(e.target.value)}
            rows={3} className="w-full px-3 py-2 border rounded" />
        </label>
        <button type="submit" disabled={busy}
          className="w-full py-2 bg-blue-600 text-white rounded disabled:opacity-50">
          {busy ? '提交中…' : '提交'}
        </button>
        {err && <div className="text-red-700 text-sm">{err}</div>}
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/employee/SubmitEditRequest.tsx
git commit -m "feat(fe): submit edit request form"
```

---

## Phase 6: Admin Features

### Task 6.1: AdminDashboard (realtime today's punches)

**Files:** Modify `src/admin/AdminDashboard.tsx`

- [ ] **Step 1: Implementation**

```tsx
// src/admin/AdminDashboard.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatTime, formatDate } from '../lib/time';
import type { EffectivePunch, Employee } from '../lib/types';

interface Row extends EffectivePunch { employee: Pick<Employee, 'full_name' | 'email'> }

function todayWindowMadrid(): { start: string; end: string } {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === 'year')!.value;
  const m = parts.find(p => p.type === 'month')!.value;
  const d = parts.find(p => p.type === 'day')!.value;
  const start = new Date(`${y}-${m}-${d}T00:00:00+02:00`);
  const end   = new Date(start.getTime() + 24*60*60*1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function AdminDashboard() {
  const [rows, setRows] = useState<Row[]>([]);

  async function load() {
    const { start, end } = todayWindowMadrid();
    const { data } = await supabase
      .from('effective_punches')
      .select('*, employee:employees!effective_punches_employee_id_fkey(full_name, email)')
      .gte('effective_time', start)
      .lt('effective_time', end)
      .order('effective_time', { ascending: false });
    setRows((data as unknown as Row[]) ?? []);
  }

  useEffect(() => {
    load();
    const ch = supabase.channel('punches')
      .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'effective_punches' },
          () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">今日打卡 — {formatDate(new Date().toISOString())}</h1>
        <nav className="flex gap-3 text-sm text-blue-700 underline">
          <Link to="/admin/approvals">审批</Link>
          <Link to="/admin/export">导出</Link>
          <Link to="/">员工视图</Link>
        </nav>
      </header>
      {rows.length === 0 ? <div className="text-gray-500">今天还没人打卡</div> :
        <ul className="divide-y border rounded bg-white">
          {rows.map(r => (
            <li key={r.id} className="px-4 py-2 flex justify-between">
              <span>{r.employee.full_name}</span>
              <span>{r.kind === 'in' ? '上班' : '下班'} · {formatTime(r.effective_time)}</span>
            </li>
          ))}
        </ul>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/admin/AdminDashboard.tsx
git commit -m "feat(fe): admin dashboard with realtime today list"
```

---

### Task 6.2: AdminApprovals

**Files:** Modify `src/admin/AdminApprovals.tsx`

- [ ] **Step 1: Implementation**

```tsx
// src/admin/AdminApprovals.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { approveEdit, rejectEdit, ApiError } from '../lib/api';
import { formatDateTime } from '../lib/time';
import type { PunchEditRequest, Employee } from '../lib/types';

interface Row extends PunchEditRequest { employee: Pick<Employee, 'full_name' | 'email'> }

export function AdminApprovals() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from('punch_edit_requests')
      .select('*, employee:employees!punch_edit_requests_employee_id_fkey(full_name, email)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    setRows((data as unknown as Row[]) ?? []);
  }
  useEffect(() => { load(); }, []);

  async function decide(id: string, kind: 'approve' | 'reject', note: string) {
    setBusy(id); setErr(null);
    try {
      if (kind === 'approve') await approveEdit(id, note);
      else await rejectEdit(id, note);
      await load();
    } catch (e: any) {
      const err = e as ApiError;
      setErr(`${kind === 'approve' ? '通过' : '拒绝'}失败：${err.code}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <Link to="/admin" className="text-blue-700 underline text-sm">← 返回</Link>
      <h1 className="text-xl font-semibold">待审批的补卡申请</h1>
      {err && <div className="text-red-700">{err}</div>}
      {rows.length === 0 ? <div className="text-gray-500">没有待审批的申请</div> :
        <ul className="space-y-3">
          {rows.map(r => (
            <li key={r.id} className="border rounded bg-white p-4 space-y-2">
              <div className="font-medium">{r.employee.full_name}</div>
              <div className="text-sm text-gray-700">
                请求：{r.requested_kind === 'in' ? '上班' : '下班'} @ {formatDateTime(r.requested_time)}
              </div>
              <div className="text-sm">原因：{r.reason}</div>
              <div className="flex gap-2">
                <button onClick={() => decide(r.id, 'approve', '')} disabled={busy === r.id}
                  className="px-3 py-1 bg-green-600 text-white rounded disabled:opacity-50">通过</button>
                <button onClick={() => decide(r.id, 'reject', '')} disabled={busy === r.id}
                  className="px-3 py-1 bg-red-600 text-white rounded disabled:opacity-50">拒绝</button>
              </div>
            </li>
          ))}
        </ul>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/admin/AdminApprovals.tsx
git commit -m "feat(fe): admin approvals page"
```

---

### Task 6.3: AdminExport

**Files:** Modify `src/admin/AdminExport.tsx`

- [ ] **Step 1: Implementation**

```tsx
// src/admin/AdminExport.tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { exportMonthCsv, ApiError } from '../lib/api';
import { currentMonthKey } from '../lib/time';

export function AdminExport() {
  const [month, setMonth] = useState(currentMonthKey());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setBusy(true); setErr(null);
    try {
      const csv = await exportMonthCsv(month);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `punches-${month}.csv`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (e: any) {
      setErr(`导出失败：${(e as ApiError).code}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto p-6 space-y-4">
      <Link to="/admin" className="text-blue-700 underline text-sm">← 返回</Link>
      <h1 className="text-xl font-semibold">导出月度 CSV</h1>
      <label className="block">
        <span className="text-sm">月份 (YYYY-MM)</span>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="w-full px-3 py-2 border rounded" />
      </label>
      <button onClick={go} disabled={busy}
        className="w-full py-2 bg-blue-600 text-white rounded disabled:opacity-50">
        {busy ? '生成中…' : '下载 CSV'}
      </button>
      {err && <div className="text-red-700">{err}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/admin/AdminExport.tsx
git commit -m "feat(fe): admin export CSV downloader"
```

---

## Phase 7: E2E Tests

### Task 7.1: Playwright setup

**Files:** Create `playwright.config.ts`

- [ ] **Step 1: Install browsers**

```bash
npx playwright install --with-deps chromium
```

- [ ] **Step 2: Config**

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,        // tests share a DB; run serially
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    geolocation: { latitude: 40.416775, longitude: -3.703790 },
    permissions: ['geolocation'],
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add playwright.config.ts
git commit -m "test(e2e): playwright config with Madrid geo + auto dev server"
```

---

### Task 7.2: e2e/employee-punch-in.spec.ts

**Files:** Create `e2e/employee-punch-in.spec.ts`

- [ ] **Step 1: Test**

```ts
// e2e/employee-punch-in.spec.ts
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SERVICE_KEY  = execSync("supabase status -o json | jq -r .SERVICE_ROLE_KEY").toString().trim();
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function seedEmployeeAndLogin(page: import('@playwright/test').Page, email: string) {
  const { data: u } = await admin.auth.admin.createUser({
    email, password: 'e2e-pw-12345', email_confirm: true,
  });
  const userId = u!.user!.id;
  await admin.from('employees').insert({
    id: userId, email, full_name: 'E2E Tester', role: 'employee',
  });
  // Drive login via SPA's own supabase instance (exposed on window in DEV)
  await page.goto('/login');
  await page.waitForFunction(() => Boolean((window as any).supabase));
  await page.evaluate(async ({ e, pw }) => {
    await (window as any).supabase.auth.signInWithPassword({ email: e, password: pw });
  }, { e: email, pw: 'e2e-pw-12345' });
  await page.goto('/');
}

async function cleanup() {
  await admin.from('effective_punches').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('punch_edit_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('punches').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('employees').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const { data } = await admin.auth.admin.listUsers();
  for (const u of data?.users ?? []) await admin.auth.admin.deleteUser(u.id);
}

test.beforeAll(cleanup);
test.afterAll(cleanup);

test('employee punches in successfully', async ({ page }) => {
  await seedEmployeeAndLogin(page, 'e2e-emp@test.local');
  await page.getByRole('button', { name: '上班打卡' }).click();
  await expect(page.getByText('上班', { exact: true })).toBeVisible();
});
```

> Note: This test assumes a running local Supabase stack and the `supabase functions serve` Edge Functions are reachable from the SPA. Add a `globalSetup` if needed in production CI.

- [ ] **Step 2: Run**

```bash
supabase start
supabase functions serve --no-verify-jwt &
VITE_SUPABASE_ANON_KEY=$(supabase status -o json | jq -r .ANON_KEY) \
npx playwright test e2e/employee-punch-in.spec.ts
kill %1
```

Expected: 1 passed.

- [ ] **Step 3: Commit**

```bash
git add e2e/employee-punch-in.spec.ts
git commit -m "test(e2e): employee punch-in flow"
```

---

### Task 7.3: e2e/admin-approve-edit.spec.ts

**Files:** Create `e2e/admin-approve-edit.spec.ts`

- [ ] **Step 1: Test**

```ts
// e2e/admin-approve-edit.spec.ts
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SERVICE_KEY  = execSync("supabase status -o json | jq -r .SERVICE_ROLE_KEY").toString().trim();
const ANON_KEY     = execSync("supabase status -o json | jq -r .ANON_KEY").toString().trim();
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function makeUser(email: string, role: 'admin' | 'employee') {
  const { data: u } = await admin.auth.admin.createUser({
    email, password: 'e2e-pw-12345', email_confirm: true,
  });
  await admin.from('employees').insert({
    id: u!.user!.id, email, full_name: email.split('@')[0], role,
  });
  return u!.user!.id;
}

async function loginAs(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login');
  await page.waitForFunction(() => Boolean((window as any).supabase));
  await page.evaluate(async ({ e, pw }) => {
    await (window as any).supabase.auth.signInWithPassword({ email: e, password: pw });
  }, { e: email, pw: 'e2e-pw-12345' });
  await page.goto('/admin/approvals');
}

async function cleanup() {
  await admin.from('effective_punches').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('punch_edit_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('employees').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const { data } = await admin.auth.admin.listUsers();
  for (const u of data?.users ?? []) await admin.auth.admin.deleteUser(u.id);
}

test.beforeAll(cleanup);
test.afterAll(cleanup);

test('admin approves a pending edit request', async ({ page }) => {
  const empId = await makeUser('e2e-emp@test.local', 'employee');
  await makeUser('e2e-boss@test.local', 'admin');

  await admin.from('punch_edit_requests').insert({
    employee_id: empId, requested_kind: 'in',
    requested_time: new Date(Date.now() - 60*60*1000).toISOString(),
    reason: 'forgot to punch',
  });

  await loginAs(page, 'e2e-boss@test.local');
  await expect(page.getByText('forgot to punch')).toBeVisible();
  await page.getByRole('button', { name: '通过' }).click();
  await expect(page.getByText('forgot to punch')).toHaveCount(0);

  // verify a row landed in effective_punches
  const { data } = await admin.from('effective_punches').select('*').eq('employee_id', empId);
  expect(data?.length).toBe(1);
});
```

- [ ] **Step 2: Run**

```bash
supabase start
supabase functions serve --no-verify-jwt &
VITE_SUPABASE_ANON_KEY=$(supabase status -o json | jq -r .ANON_KEY) \
npx playwright test e2e/admin-approve-edit.spec.ts
kill %1
```

Expected: 1 passed.

- [ ] **Step 3: Commit**

```bash
git add e2e/admin-approve-edit.spec.ts
git commit -m "test(e2e): admin approves edit request flow"
```

---

## Phase 8: CI & Deploy

### Task 8.1: GitHub Actions — RLS + Edge Function tests

**Files:** Create `.github/workflows/test.yml`

- [ ] **Step 1: Workflow**

```yaml
# .github/workflows/test.yml
name: test
on:
  push: { branches: [main] }
  pull_request: {}

jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v1
        with: { deno-version: v1.x }
      - uses: supabase/setup-cli@v1
        with: { version: latest }
      - run: supabase start
      - name: Apply migrations and seed
        run: supabase db reset
      - name: Run RLS tests
        run: |
          for f in tests/rls/*.test.sql; do
            psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f "$f"
          done
      - name: Serve functions
        run: supabase functions serve --no-verify-jwt &
      - name: Wait for functions
        run: sleep 5
      - name: Run Edge Function tests
        env:
          SUPABASE_SERVICE_ROLE_KEY: ${{ steps.start.outputs.service_role_key }}
          SUPABASE_ANON_KEY:         ${{ steps.start.outputs.anon_key }}
        run: |
          export SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o json | jq -r .SERVICE_ROLE_KEY)
          export SUPABASE_ANON_KEY=$(supabase status -o json | jq -r .ANON_KEY)
          for d in supabase/functions/*/; do
            if [ -f "${d}test.ts" ]; then
              deno test --allow-all "${d}test.ts"
            fi
          done
          deno test --allow-all supabase/functions/_shared/haversine.test.ts
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "ci: run RLS + Edge Function tests on push/PR"
```

---

### Task 8.2: Create Supabase cloud project + push schema

- [ ] **Step 1: Manual — create project**

Go to https://supabase.com/dashboard, click "New project". Region: `eu-west-2` (or nearest to Madrid). Name: `clock-in-app`. Save the project ref (e.g. `abcdefg`) and DB password.

- [ ] **Step 2: Link local repo to cloud project**

```bash
supabase link --project-ref <project-ref>
```

Enter the DB password when prompted.

- [ ] **Step 3: Push migrations**

```bash
supabase db push
```

Expected: applies all 4 migrations to the cloud DB.

- [ ] **Step 4: Apply seed (one-time)**

```bash
psql "<connection string from dashboard → Settings → Database>" \
  -f supabase/seed.sql
```

- [ ] **Step 5: Deploy Edge Functions**

```bash
supabase functions deploy punch-in --no-verify-jwt=false
supabase functions deploy submit-edit-request
supabase functions deploy approve-edit
supabase functions deploy reject-edit
supabase functions deploy export-month
```

Expected: each prints "Deployed Function".

- [ ] **Step 6: Verify in Studio**

Open the cloud Studio URL, check that 5 tables, 3 views/RPC, and 5 functions are all present.

(No commit — this is infra setup, not code.)

---

### Task 8.3: Update office coordinates to the real office

- [ ] **Step 1: Edit seed**

Open `supabase/seed.sql` and replace `40.416775, -3.703790` (Madrid Sol) with your actual office GPS coords. Pick coords from Google Maps (right-click → "What's here?").

- [ ] **Step 2: Apply to cloud**

```bash
psql "<cloud DB connection>" \
  -c "UPDATE public.office_locations SET latitude=<LAT>, longitude=<LNG> WHERE name='Oficina Principal';"
```

- [ ] **Step 3: Commit local seed**

```bash
git add supabase/seed.sql
git commit -m "chore: set real office coordinates"
```

---

### Task 8.4: Create the first admin user

- [ ] **Step 1: Send magic link to admin email**

In Supabase Studio → Authentication → Users → "Invite user", enter the admin's email (e.g., `jli@altech.es`). They'll get an email; clicking confirms the account.

Once they appear in `auth.users`, copy the UUID.

- [ ] **Step 2: Insert employees row as admin**

```sql
INSERT INTO public.employees (id, email, full_name, role)
VALUES ('<uuid>', 'jli@altech.es', 'Jli', 'admin');
```

Run this via Studio SQL editor.

(No commit.)

---

### Task 8.5: Deploy frontend to Vercel

- [ ] **Step 1: Push repo to GitHub**

```bash
gh repo create clock-in-app --private --source=. --remote=origin --push
```

- [ ] **Step 2: Connect to Vercel**

Go to https://vercel.com/new, import the GitHub repo. In project settings:
- Framework Preset: Vite
- Environment Variables:
  - `VITE_SUPABASE_URL` = `https://<project-ref>.supabase.co`
  - `VITE_SUPABASE_ANON_KEY` = (from Supabase Settings → API)

Click Deploy.

- [ ] **Step 3: Smoke test in production**

After deploy, visit the Vercel URL. Login as admin (magic link). Try punching in from inside the geofence. Try from outside (use browser DevTools → Sensors). Verify expected error messages.

---

### Task 8.6: README

**Files:** Create `README.md`

- [ ] **Step 1: Brief README**

```markdown
# Clock-In App

Spanish-labor-law-compliant punch-in/out web app for 5 employees.

## Stack

- React + Vite (Vercel)
- Supabase Postgres + Auth + Edge Functions

## Local development

```bash
npm install
supabase start
supabase functions serve --no-verify-jwt
npm run dev
```

## Tests

- RLS:        `for f in tests/rls/*.test.sql; do psql "$DB_URL" -f $f; done`
- Edge fns:   `deno test --allow-all supabase/functions/*/test.ts`
- E2E:        `npx playwright test`

## Docs

- Spec:  `docs/superpowers/specs/2026-05-16-clock-in-app-design.md`
- Plan:  `docs/superpowers/plans/2026-05-16-clock-in-app-implementation.md`
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with local dev and test commands"
```

---

## Self-Review Notes

Coverage of spec sections:

| Spec section | Plan task(s) |
|---|---|
| §4 Architecture (Vite + Supabase + Edge Functions) | Tasks 1.1, 1.2, 4.1–4.3 |
| §5 Data model (5 tables, RLS) | Tasks 2.1, 2.2 |
| §5 RPC for atomic insert | Task 2.4 |
| §6 punch-in flow + Haversine + dedup | Tasks 3.1, 3.3, 3.4, 3.5 |
| §6 submit/approve/reject edit | Tasks 3.6, 3.7, 3.8 |
| §6 monthly export | Task 3.9 |
| §6 Realtime admin view | Task 6.1 |
| §7 Error handling (LOW_ACCURACY, OUT_OF_GEOFENCE, TOO_SOON, INVALID_SEQUENCE) | Task 3.5 |
| §7 Cross-midnight pairing | Task 2.3 (daily_worked view) |
| §7 Europe/Madrid display | Task 4.4 (`time.ts`), Task 3.9 |
| §8 Edge function tests | Tasks 3.3–3.9 |
| §8 RLS tests | Tasks 2.7–2.9 |
| §8 E2E (2 paths) | Tasks 7.2, 7.3 |
| §8 CI | Task 8.1 |

No placeholders or TBDs. Method signatures referenced consistently (`punchIn`, `submitEditRequest`, `approveEdit`, `rejectEdit`, `exportMonthCsv` defined in Task 4.4 and used in Tasks 5–6). Postgres function names (`create_punch`, `approve_edit_request`, `reject_edit_request`) defined in Task 2.4 and consumed in Tasks 3.4, 3.7, 3.8.

**Known gaps acknowledged in spec §10 (deferred to v2):** PDF export, email notifications, multi-office UI switcher, anomaly detection. These are not in the plan by design.
