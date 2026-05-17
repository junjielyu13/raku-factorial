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
