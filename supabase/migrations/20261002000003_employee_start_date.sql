-- 20261002000003_employee_start_date.sql
--
-- First working day of each employee (Madrid calendar date). The admin
-- dashboard never flags absences / backfills days before it. Defaults to the
-- day the company started using the app; set per employee for new hires.
-- ADD COLUMN keeps the table's existing grants.

ALTER TABLE public.employees
  ADD COLUMN start_date date NOT NULL DEFAULT '2026-04-29';
