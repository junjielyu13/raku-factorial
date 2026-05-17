-- tests/rls/punches.test.sql
\set ON_ERROR_STOP on
BEGIN;
\i tests/rls/helpers.sql

DO $$
DECLARE
  alice  uuid := test_make_user('alice@test.local', 'employee');
  bob    uuid := test_make_user('bob@test.local',   'employee');
  office uuid;
  n int;
BEGIN
  SELECT id INTO office FROM public.office_locations LIMIT 1;

  -- Insert a punch for Bob using service_role-like bypass
  PERFORM set_config('role', 'postgres', true);
  INSERT INTO public.punches (employee_id, kind, latitude, longitude, office_id)
  VALUES (bob, 'in', 40.416775, -3.703790, office);

  -- Switch to Alice and count Bob's punches
  PERFORM test_set_user(alice);
  SELECT count(*) INTO n FROM public.punches WHERE employee_id = bob;
  ASSERT n = 0, format('Alice saw %s of Bobs punches; expected 0', n);

  -- Switch to Bob; should see his own
  PERFORM test_set_user(bob);
  SELECT count(*) INTO n FROM public.punches WHERE employee_id = bob;
  ASSERT n = 1, format('Bob saw %s of his own punches; expected 1', n);

  -- As Bob, attempting direct INSERT must fail
  PERFORM test_set_user(bob);
  BEGIN
    INSERT INTO public.punches (employee_id, kind, latitude, longitude, office_id)
    VALUES (bob, 'in', 40.416775, -3.703790, office);
    ASSERT false, 'Bob was able to insert directly; RLS broken';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    NULL; -- expected
  END;
END $$;

ROLLBACK;
