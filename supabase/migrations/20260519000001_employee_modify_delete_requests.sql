-- 20260519000001_employee_modify_delete_requests.sql
-- 让员工也可以申请 modify / delete 打卡（之前 submit-edit-request 只支持 add）。
-- approve_edit_request 现在按 punch_edit_requests.action 分派：
--   add    → 新建 effective_punches 行（原有行为）
--   modify → 新建 effective_punches 行 + 把 target 标记为 superseded
--   delete → 只把 target 标记为 superseded（不产生新行）

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
  v_req    public.punch_edit_requests%ROWTYPE;
  v_target public.effective_punches%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM public.punch_edit_requests
    WHERE id = p_request_id FOR UPDATE;

  IF v_req IS NULL THEN
    RAISE EXCEPTION 'request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'request already %', v_req.status USING ERRCODE = 'P0001';
  END IF;

  IF v_req.action = 'add' THEN
    INSERT INTO public.effective_punches
      (employee_id, kind, effective_time, source_request_id)
    VALUES
      (v_req.employee_id, v_req.requested_kind, v_req.requested_time, v_req.id);
  ELSE
    -- modify / delete need an existing live target
    SELECT * INTO v_target FROM public.effective_punches
      WHERE id = v_req.target_effective_id FOR UPDATE;
    IF v_target IS NULL THEN
      RAISE EXCEPTION 'effective punch not found' USING ERRCODE = 'P0002';
    END IF;
    IF v_target.superseded_at IS NOT NULL THEN
      RAISE EXCEPTION 'already superseded' USING ERRCODE = 'P0001';
    END IF;

    IF v_req.action = 'modify' THEN
      INSERT INTO public.effective_punches
        (employee_id, kind, effective_time, source_request_id)
      VALUES
        (v_target.employee_id, v_req.requested_kind, v_req.requested_time, v_req.id);
    END IF;
    -- delete: no new effective_punches row

    UPDATE public.effective_punches
      SET superseded_at = now(), superseded_by_request_id = v_req.id
      WHERE id = v_target.id;
  END IF;

  UPDATE public.punch_edit_requests
    SET status='approved', reviewed_by=p_reviewer_id, reviewed_at=now(), review_note=p_note
    WHERE id = p_request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_edit_request FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.approve_edit_request TO service_role;
