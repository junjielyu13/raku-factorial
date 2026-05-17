-- 20260517000001_atomic_punch.sql
-- Move dedup/sequence checks inside create_punch with per-employee advisory lock.
-- This closes a TOCTOU race where two concurrent requests could both pass
-- the application-level pre-check and then both INSERT.

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
  v_last_kind   text;
  v_last_at     timestamptz;
BEGIN
  -- Serialize concurrent punch attempts for the same employee.
  PERFORM pg_advisory_xact_lock(hashtextextended('punch_in_' || p_employee_id::text, 0));

  -- Re-check last punch under the lock.
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
