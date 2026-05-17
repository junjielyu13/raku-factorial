// supabase/functions/punch-in/test.ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

const SUPABASE_URL      = 'http://127.0.0.1:54321';
const SERVICE_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY          = Deno.env.get('SUPABASE_ANON_KEY')!;
const FUNC_URL          = `${SUPABASE_URL}/functions/v1/punch-in`;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function makeEmployee(email: string): Promise<{ id: string; jwt: string }> {
  const { data: u, error: uErr } = await admin.auth.admin.createUser({
    email, password: 'test-pw-12345', email_confirm: true,
  });
  if (uErr || !u.user) throw uErr;
  await admin.from('employees').insert({
    id: u.user.id, email, full_name: email.split('@')[0], role: 'employee',
  });
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
  name: "punch-in: with GPS coords → 200, coords recorded",
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const { id, jwt } = await makeEmployee('with-gps@test.local');
    const res = await callPunchIn(jwt, {
      kind: 'in',
      latitude: 41.478107,
      longitude: 2.084087,
      accuracy_m: 20,
    });
    assertEquals(res.status, 200);
    const json = await res.json();
    assert(json.punch_id, 'expected punch_id in response');
    const { data: punches } = await admin.from('punches').select('*').eq('employee_id', id);
    const { data: effs }    = await admin.from('effective_punches').select('*').eq('employee_id', id);
    assertEquals(punches?.length, 1);
    assertEquals(effs?.length, 1);
    assertEquals(Number(punches![0].latitude),  41.478107);
    assertEquals(Number(punches![0].longitude), 2.084087);
    await cleanup();
  },
});

Deno.test({
  name: "punch-in: anywhere on Earth → 200 (no geofence enforcement)",
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const { id, jwt } = await makeEmployee('far-away@test.local');
    // Antarctica
    const res = await callPunchIn(jwt, {
      kind: 'in', latitude: -82.0, longitude: 135.0, accuracy_m: 80,
    });
    assertEquals(res.status, 200);
    const { data: punches } = await admin.from('punches').select('*').eq('employee_id', id);
    assertEquals(punches?.length, 1);
    assertEquals(Number(punches![0].latitude), -82);
    await cleanup();
  },
});

Deno.test({
  name: "punch-in: GPS coords omitted → 400 GPS_REQUIRED",
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const { jwt } = await makeEmployee('no-gps@test.local');
    const res = await callPunchIn(jwt, { kind: 'in' });
    assertEquals(res.status, 400);
    assertEquals((await res.json()).error, 'GPS_REQUIRED');
    await cleanup();
  },
});

Deno.test({ name: "punch-in: duplicate within 60s → 409 TOO_SOON", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const { jwt } = await makeEmployee('dup@test.local');
    const r1 = await callPunchIn(jwt, { kind:'in', latitude: 41.478107, longitude: 2.084087 });
    assertEquals(r1.status, 200);
    const r2 = await callPunchIn(jwt, { kind:'out', latitude: 41.478107, longitude: 2.084087 });
    assertEquals(r2.status, 409);
    assertEquals((await r2.json()).error, 'TOO_SOON');
    await cleanup();
  }});

Deno.test({ name: "punch-in: two consecutive 'in' → 409 INVALID_SEQUENCE", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const { id, jwt } = await makeEmployee('seq@test.local');
    // Backdate first punch so 60s window doesn't trip
    await admin.from('punches').insert({
      employee_id: id, kind: 'in',
      recorded_at: new Date(Date.now() - 5*60*1000).toISOString(),
      latitude: 41.478107, longitude: 2.084087,
    });
    const res = await callPunchIn(jwt, { kind: 'in', latitude: 41.478107, longitude: 2.084087 });
    assertEquals(res.status, 409);
    assertEquals((await res.json()).error, 'INVALID_SEQUENCE');
    await cleanup();
  }});

Deno.test({ name: "punch-in: missing JWT → 401", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    const res = await fetch(FUNC_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind:'in', latitude: 41.478107, longitude: 2.084087 }),
    });
    assertEquals(res.status, 401);
  }});
