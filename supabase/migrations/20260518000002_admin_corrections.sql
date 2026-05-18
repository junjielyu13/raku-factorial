-- 20260518000002_admin_corrections.sql
-- 管理员代补卡 / 打卡修正：审计列、软删除列、RPC、视图更新。

-- 1. punch_edit_requests：统一修正审计日志的新列
ALTER TABLE public.punch_edit_requests
  ADD COLUMN created_by uuid REFERENCES public.employees(id),
  ADD COLUMN action text NOT NULL DEFAULT 'add'
    CHECK (action IN ('add', 'modify', 'delete')),
  ADD COLUMN target_effective_id uuid REFERENCES public.effective_punches(id);

-- 2. effective_punches：软删除二元组
ALTER TABLE public.effective_punches
  ADD COLUMN superseded_at timestamptz,
  ADD COLUMN superseded_by_request_id uuid REFERENCES public.punch_edit_requests(id);

-- 3. 管理员修正 RPC（原子）
CREATE OR REPLACE FUNCTION public.admin_correct_punch(
  p_admin_id            uuid,
  p_action              text,
  p_target_effective_id uuid,
  p_employee_id         uuid,
  p_kind                text,
  p_time                timestamptz,
  p_reason              text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target public.effective_punches%ROWTYPE;
  v_req_id uuid;
BEGIN
  IF p_action NOT IN ('add', 'modify', 'delete') THEN
    RAISE EXCEPTION 'bad action' USING ERRCODE = 'P0002';
  END IF;

  -- add：员工从未打过的卡
  IF p_action = 'add' THEN
    INSERT INTO public.punch_edit_requests
      (employee_id, requested_kind, requested_time, reason,
       action, status, created_by, reviewed_by, reviewed_at)
    VALUES
      (p_employee_id, p_kind, p_time, p_reason,
       'add', 'approved', p_admin_id, p_admin_id, now())
    RETURNING id INTO v_req_id;

    INSERT INTO public.effective_punches
      (employee_id, kind, effective_time, source_request_id)
    VALUES
      (p_employee_id, p_kind, p_time, v_req_id);
    RETURN;
  END IF;

  -- modify / delete：都需要一条已存在的目标有效记录
  SELECT * INTO v_target FROM public.effective_punches
    WHERE id = p_target_effective_id FOR UPDATE;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'effective punch not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_target.superseded_at IS NOT NULL THEN
    RAISE EXCEPTION 'already superseded' USING ERRCODE = 'P0001';
  END IF;

  IF p_action = 'modify' THEN
    INSERT INTO public.punch_edit_requests
      (employee_id, original_punch_id, target_effective_id,
       requested_kind, requested_time, reason,
       action, status, created_by, reviewed_by, reviewed_at)
    VALUES
      (v_target.employee_id, v_target.source_punch_id, v_target.id,
       p_kind, p_time, p_reason,
       'modify', 'approved', p_admin_id, p_admin_id, now())
    RETURNING id INTO v_req_id;

    INSERT INTO public.effective_punches
      (employee_id, kind, effective_time, source_request_id)
    VALUES
      (v_target.employee_id, p_kind, p_time, v_req_id);
  ELSE
    -- delete：把被作废打卡的 kind/time 记进审计，不产生新有效记录
    INSERT INTO public.punch_edit_requests
      (employee_id, original_punch_id, target_effective_id,
       requested_kind, requested_time, reason,
       action, status, created_by, reviewed_by, reviewed_at)
    VALUES
      (v_target.employee_id, v_target.source_punch_id, v_target.id,
       v_target.kind, v_target.effective_time, p_reason,
       'delete', 'approved', p_admin_id, p_admin_id, now())
    RETURNING id INTO v_req_id;
  END IF;

  UPDATE public.effective_punches
    SET superseded_at = now(), superseded_by_request_id = v_req_id
    WHERE id = v_target.id;
END;
$$;

-- 仅 service_role（Edge Function）可执行
REVOKE EXECUTE ON FUNCTION public.admin_correct_punch FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_correct_punch TO service_role;

-- 4. daily_worked 视图：排除已取代的有效记录（列清单不变，CREATE OR REPLACE 安全）
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
  WHERE ep.superseded_at IS NULL
)
SELECT
  employee_id,
  (in_time AT TIME ZONE 'Europe/Madrid')::date AS work_date,
  in_time,
  next_time AS out_time,
  (next_time - in_time) AS duration
FROM paired
WHERE kind = 'in' AND next_kind = 'out';

ALTER VIEW public.daily_worked SET (security_invoker = on);
