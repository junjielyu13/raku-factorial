-- tests/rls/edit_requests.test.sql
\set ON_ERROR_STOP on
BEGIN;
\i tests/rls/helpers.sql

DO $$
DECLARE
  alice uuid := test_make_user('alice2@test.local', 'employee');
  boss  uuid := test_make_user('boss@test.local',   'admin');
  n int;
BEGIN
  -- Alice submits a request
  PERFORM test_set_user(alice);
  INSERT INTO public.punch_edit_requests
    (employee_id, requested_kind, requested_time, reason)
  VALUES
    (alice, 'in', now() - interval '1 hour', 'forgot to punch in');

  -- Alice sees her own
  SELECT count(*) INTO n FROM public.punch_edit_requests WHERE employee_id = alice;
  ASSERT n = 1, format('Alice saw %s of her requests; expected 1', n);

  -- Alice cannot insert for someone else
  BEGIN
    INSERT INTO public.punch_edit_requests
      (employee_id, requested_kind, requested_time, reason)
    VALUES (boss, 'in', now(), 'imposter');
    ASSERT false, 'Alice inserted for boss; RLS broken';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    NULL;
  END;

  -- Alice cannot update her own status to approved
  BEGIN
    UPDATE public.punch_edit_requests
      SET status='approved' WHERE employee_id = alice;
    -- If 0 rows affected, that's also fine (RLS hides the row)
    SELECT count(*) INTO n FROM public.punch_edit_requests
      WHERE employee_id = alice AND status = 'approved';
    ASSERT n = 0, 'Alice approved her own request; RLS broken';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- Admin sees all
  PERFORM test_set_user(boss);
  SELECT count(*) INTO n FROM public.punch_edit_requests;
  ASSERT n >= 1, format('Boss saw %s requests; expected >= 1', n);
END $$;

ROLLBACK;
