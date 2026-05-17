// supabase/functions/punch-in/test.ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

const SUPABASE_URL      = 'http://127.0.0.1:54321';
const SERVICE_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY          = Deno.env.get('SUPABASE_ANON_KEY')!;
const FUNC_URL          = `${SUPABASE_URL}/functions/v1/punch-in`;
const OFFICE_LAT = 40.416775;
const OFFICE_LNG = -3.703790;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function makeEmployee(email: string): Promise<{ id: string; jwt: string }> {
  // create auth user
  const { data: u, error: uErr } = await admin.auth.admin.createUser({
    email, password: 'test-pw-12345', email_confirm: true,
  });
  if (uErr || !u.user) throw uErr;
  // employees row
  await admin.from('employees').insert({
    id: u.user.id, email, full_name: email.split('@')[0], role: 'employee',
  });
  // get JWT via password login
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error: sErr } = await anon.auth.signInWithPassword({
    email, password: 'test-pw-12345',
  });
  if (sErr || !s.session) throw sErr;
  return { id: u.user.id, jwt: s.session.access_token };
}

async function cleanup() {
  await admin.from('effective_punches').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('punch_edit_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('punches').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('employees').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  // remove all auth users created above
  const { data } = await admin.auth.admin.listUsers();
  for (const u of data?.users ?? []) {
    await admin.auth.admin.deleteUser(u.id);
  }
}

async function callPunchIn(jwt: string, body: unknown): Promise<Response> {
  return await fetch(FUNC_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

Deno.test({
  name: "punch-in: inside geofence + good accuracy → 200",
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const { id, jwt } = await makeEmployee('inside@test.local');
    const res = await callPunchIn(jwt, {
      kind: 'in',
      latitude: OFFICE_LAT,
      longitude: OFFICE_LNG,
      accuracy_m: 20,
    });
    assertEquals(res.status, 200);
    const json = await res.json();
    assert(json.punch_id, 'expected punch_id in response');
    // verify both tables got rows
    const { data: punches } = await admin.from('punches').select('*').eq('employee_id', id);
    const { data: effs } = await admin.from('effective_punches').select('*').eq('employee_id', id);
    assertEquals(punches?.length, 1);
    assertEquals(effs?.length, 1);
    await cleanup();
  },
});
