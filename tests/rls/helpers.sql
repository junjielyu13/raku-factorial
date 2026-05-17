-- tests/rls/helpers.sql
-- Helpers to simulate a logged-in user inside a SQL session.

CREATE OR REPLACE FUNCTION test_set_user(user_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', user_id::text, 'role', 'authenticated')::text,
    true);
  PERFORM set_config('role', 'authenticated', true);
END;
$$;

CREATE OR REPLACE FUNCTION test_set_anon()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM set_config('role', 'anon', true);
END;
$$;

-- Create a deterministic test user + employee row
CREATE OR REPLACE FUNCTION test_make_user(p_email text, p_role text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, email, aud, role)
  VALUES (v_id, p_email, 'authenticated', 'authenticated');
  INSERT INTO public.employees (id, email, full_name, role)
  VALUES (v_id, p_email, split_part(p_email, '@', 1), p_role);
  RETURN v_id;
END;
$$;
