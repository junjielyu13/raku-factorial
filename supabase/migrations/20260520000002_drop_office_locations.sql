-- 20260520000002_drop_office_locations.sql
-- Drop office_locations table and punches.office_id.
-- Office coords are now a code constant (src/lib/office.ts); we only ever had
-- one office and never enforce the geofence radius.
--
-- Safe to run after deploying the updated punch-in edge function (which no
-- longer passes p_office_id). Old function calls would still succeed against
-- the new RPC signature because p_office_id had DEFAULT NULL.

-- Drop dependent column first (also drops the FK constraint).
ALTER TABLE public.punches DROP COLUMN IF EXISTS office_id;

-- Drop the table (RLS policies attached to it drop with it).
DROP TABLE IF EXISTS public.office_locations;

-- Recreate create_punch without p_office_id.
DROP FUNCTION IF EXISTS public.create_punch(uuid, text, numeric, numeric, numeric, uuid, text, inet);

CREATE OR REPLACE FUNCTION public.create_punch(
  p_employee_id uuid,
  p_kind        text,
  p_lat         numeric DEFAULT NULL,
  p_lng         numeric DEFAULT NULL,
  p_accuracy    numeric DEFAULT NULL,
  p_user_agent  text    DEFAULT NULL,
  p_ip          inet    DEFAULT NULL
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
  v_last_kind   text;
  v_last_at     timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('punch_in_' || p_employee_id::text, 0));

  SELECT p.kind, p.recorded_at INTO v_last_kind, v_last_at
    FROM public.punches p
    WHERE p.employee_id = p_employee_id
    ORDER BY p.recorded_at DESC
    LIMIT 1;

  IF FOUND THEN
    IF extract(epoch from (now() - v_last_at)) < 60 THEN
      RAISE EXCEPTION 'too soon' USING ERRCODE = 'P0003';
    END IF;
    IF v_last_kind = p_kind THEN
      RAISE EXCEPTION 'invalid sequence' USING ERRCODE = 'P0004';
    END IF;
  ELSIF p_kind = 'out' THEN
    RAISE EXCEPTION 'invalid sequence (no prior in)' USING ERRCODE = 'P0004';
  END IF;

  INSERT INTO public.punches
    (employee_id, kind, latitude, longitude, accuracy_m, user_agent, ip_address)
  VALUES
    (p_employee_id, p_kind, p_lat, p_lng, p_accuracy, p_user_agent, p_ip)
  RETURNING punches.id, punches.recorded_at
  INTO v_punch_id, v_recorded_at;

  INSERT INTO public.effective_punches
    (employee_id, kind, effective_time, source_punch_id)
  VALUES
    (p_employee_id, p_kind, v_recorded_at, v_punch_id);

  RETURN QUERY SELECT v_punch_id, v_recorded_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_punch FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.create_punch TO service_role;
