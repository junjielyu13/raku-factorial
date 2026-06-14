-- 20260614000001_admin_backfill_punches.sql
-- 管理员「一键补卡」：在单个事务里按排班补齐某员工一周内缺失的打卡。
-- 复用已带审计的 admin_correct_punch（action='add'），整体原子：任一条失败则全部回滚。

CREATE OR REPLACE FUNCTION public.admin_backfill_punches(
  p_admin_id    uuid,
  p_employee_id uuid,
  p_punches     jsonb,   -- [{ "kind": "in"|"out", "time": "<iso>" }, ...]，按时间升序
  p_reason      text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item  jsonb;
  v_kind  text;
  v_time  timestamptz;
  v_count integer := 0;
BEGIN
  IF p_employee_id IS NULL THEN
    RAISE EXCEPTION 'bad employee' USING ERRCODE = 'P0002';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'bad reason' USING ERRCODE = 'P0002';
  END IF;
  IF jsonb_typeof(p_punches) <> 'array' OR jsonb_array_length(p_punches) = 0 THEN
    RAISE EXCEPTION 'no punches' USING ERRCODE = 'P0002';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_punches)
  LOOP
    v_kind := v_item->>'kind';
    v_time := (v_item->>'time')::timestamptz;

    IF v_kind NOT IN ('in', 'out') THEN
      RAISE EXCEPTION 'bad kind' USING ERRCODE = 'P0002';
    END IF;
    IF v_time IS NULL THEN
      RAISE EXCEPTION 'bad time' USING ERRCODE = 'P0002';
    END IF;
    IF v_time > now() THEN
      RAISE EXCEPTION 'future time' USING ERRCODE = 'P0002';
    END IF;

    -- 复用单条补卡（写 approved 的 punch_edit_requests + effective_punches）。
    PERFORM public.admin_correct_punch(
      p_admin_id, 'add', NULL, p_employee_id, v_kind, v_time, p_reason
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- 仅 service_role（Edge Function）可执行。
REVOKE EXECUTE ON FUNCTION public.admin_backfill_punches FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_backfill_punches TO service_role;
