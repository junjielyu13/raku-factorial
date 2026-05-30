-- 20260530000002_daily_worked_same_day.sql
--
-- Fix two issues in daily_worked (the source of monthly_hours, used by the
-- Excel/CSV export totals) so it matches the app's worked-time logic in
-- src/lib/worked.ts:
--   1. Pair an `in` with the next `out` only when both fall on the SAME Madrid
--      day. A forgotten punch-out previously bridged an `in` to the next day's
--      `out`, fabricating a multi-hour overnight shift.
--   2. Ignore superseded punches (the superseded_at column was added after this
--      view was first created), so admin-corrected/replaced punches don't count.

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
WHERE kind = 'in' AND next_kind = 'out'
  AND (next_time AT TIME ZONE 'Europe/Madrid')::date
    = (in_time   AT TIME ZONE 'Europe/Madrid')::date;

-- Preserve the security_invoker flag (views bypass RLS by default in PG ≤14).
ALTER VIEW public.daily_worked SET (security_invoker = on);
