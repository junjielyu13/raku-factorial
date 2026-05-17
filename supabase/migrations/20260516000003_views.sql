-- 20260516000003_views.sql

-- Per-day worked duration: pair each "in" with the next "out" for the same employee
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
)
SELECT
  employee_id,
  (in_time AT TIME ZONE 'Europe/Madrid')::date AS work_date,
  in_time,
  next_time AS out_time,
  (next_time - in_time) AS duration
FROM paired
WHERE kind = 'in' AND next_kind = 'out';

-- Monthly hours per employee (in Europe/Madrid)
CREATE OR REPLACE VIEW public.monthly_hours AS
SELECT
  employee_id,
  date_trunc('month', work_date)::date AS month,
  sum(duration) AS worked_total
FROM public.daily_worked
GROUP BY employee_id, date_trunc('month', work_date);

-- Make views inherit RLS from underlying tables
ALTER VIEW public.daily_worked   SET (security_invoker = on);
ALTER VIEW public.monthly_hours  SET (security_invoker = on);
