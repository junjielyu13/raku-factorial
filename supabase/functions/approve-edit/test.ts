// supabase/functions/approve-edit/test.ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;
const FUNC_URL     = `${SUPABASE_URL}/functions/v1/approve-edit`;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function makeUser(email: string, role: 'employee' | 'admin') {
  const { data: u } = await admin.auth.admin.createUser({
    email, password: 'test-pw-12345', email_confirm: true,
  });
  await admin.from('employees').insert({
    id: u!.user!.id, email, full_name: email.split('@')[0], role,
  });
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await anon.auth.signInWithPassword({ email, password: 'test-pw-12345' });
  return { id: u!.user!.id, jwt: s!.session!.access_token };
}

async function cleanup() {
  await admin.from('effective_punches').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('punch_edit_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('employees').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const { data } = await admin.auth.admin.listUsers();
  for (const u of data?.users ?? []) await admin.auth.admin.deleteUser(u.id);
}

async function makePendingRequest(employeeId: string) {
  const { data, error } = await admin.from('punch_edit_requests').insert({
    employee_id: employeeId,
    requested_kind: 'in',
    requested_time: new Date(Date.now() - 60*60*1000).toISOString(),
    reason: 'forgot',
  }).select('id').single();
  if (error) throw error;
  return data.id;
}

async function call(jwt: string, requestId: string, note = 'ok') {
  return fetch(FUNC_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ request_id: requestId, note }),
  });
}

Deno.test({ name: "approve-edit: admin approves → 200, effective_punches +1, status=approved", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const emp   = await makeUser('emp@test.local', 'employee');
    const boss  = await makeUser('boss@test.local', 'admin');
    const reqId = await makePendingRequest(emp.id);

    const res = await call(boss.jwt, reqId);
    assertEquals(res.status, 200);

    const { data: req } = await admin.from('punch_edit_requests').select('status,reviewed_by').eq('id', reqId).single();
    assertEquals(req!.status, 'approved');
    assertEquals(req!.reviewed_by, boss.id);

    const { data: effs } = await admin.from('effective_punches').select('*').eq('source_request_id', reqId);
    assertEquals(effs?.length, 1);
    await cleanup();
  }});

Deno.test({ name: "approve-edit: non-admin → 403 NOT_ADMIN", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const emp   = await makeUser('emp2@test.local', 'employee');
    const reqId = await makePendingRequest(emp.id);
    const res = await call(emp.jwt, reqId);
    assertEquals(res.status, 403);
    assertEquals((await res.json()).error, 'NOT_ADMIN');
    await cleanup();
  }});

Deno.test({ name: "approve-edit: already approved → 409 ALREADY_DECIDED", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const emp  = await makeUser('emp3@test.local', 'employee');
    const boss = await makeUser('boss3@test.local', 'admin');
    const reqId = await makePendingRequest(emp.id);
    const r1 = await call(boss.jwt, reqId);
    assertEquals(r1.status, 200);
    const r2 = await call(boss.jwt, reqId);
    assertEquals(r2.status, 409);
    assertEquals((await r2.json()).error, 'ALREADY_DECIDED');
    await cleanup();
  }});
