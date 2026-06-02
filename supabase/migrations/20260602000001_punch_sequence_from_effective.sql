-- 20260602000001_punch_sequence_from_effective.sql
-- Fix: employee can't clock out (or in) after an admin correction.
--
-- create_punch derived the "last punch" for its dedup / sequence guard from the
-- raw `punches` table, but admin corrections (admin_correct_punch) and the
-- frontend status both use `effective_punches`. An admin-added punch lands only
-- in effective_punches, so the guard never saw it: the UI showed a clock-OUT
-- button while the RPC still believed there was no prior 'in' and rejected the
-- out punch with P0004. Make the guard read the same source of truth as the
-- rest of the system: the latest non-superseded effective_punch by
-- effective_time.

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
  v_found       boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('punch_in_' || p_employee_id::text, 0));

  -- Source of truth for current state = latest non-superseded effective punch,
  -- so admin corrections are taken into account (matches the UI and reports).
  SELECT ep.kind, ep.effective_time INTO v_last_kind, v_last_at
    FROM public.effective_punches ep
    WHERE ep.employee_id = p_employee_id
      AND ep.superseded_at IS NULL
    ORDER BY ep.effective_time DESC
    LIMIT 1;
  v_found := FOUND;

  IF v_found THEN
    -- Anti double-tap: two real punches arriving within 60s of each other.
    -- effective_time of a live punch == its server time, so backdated admin
    -- corrections (effective_time in the past) never trip this.
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
