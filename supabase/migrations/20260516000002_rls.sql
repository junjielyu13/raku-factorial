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
