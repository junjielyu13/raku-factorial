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
