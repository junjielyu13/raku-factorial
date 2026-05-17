// supabase/functions/submit-edit-request/test.ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

const SUPABASE_URL  = 'http://127.0.0.1:54321';
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY      = Deno.env.get('SUPABASE_ANON_KEY')!;
const FUNC_URL      = `${SUPABASE_URL}/functions/v1/submit-edit-request`;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function makeEmployee(email: string) {
  const { data: u } = await admin.auth.admin.createUser({
    email, password: 'test-pw-12345', email_confirm: true,
  });
  await admin.from('employees').insert({
    id: u!.user!.id, email, full_name: email.split('@')[0], role: 'employee',
  });
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await anon.auth.signInWithPassword({ email, password: 'test-pw-12345' });
  return { id: u!.user!.id, jwt: s!.session!.access_token };
}

async function cleanup() {
  await admin.from('effective_punches').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('punch_edit_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('punches').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('employees').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const { data } = await admin.auth.admin.listUsers();
  for (const u of data?.users ?? []) await admin.auth.admin.deleteUser(u.id);
}

async function submit(jwt: string, body: unknown): Promise<Response> {
  return await fetch(FUNC_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

Deno.test({ name: "submit-edit-request: valid request → 200, row created", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const { id, jwt } = await makeEmployee('emp@test.local');
    const requestedTime = new Date(Date.now() - 60*60*1000).toISOString();
    const res = await submit(jwt, {
      requested_kind: 'in', requested_time: requestedTime, reason: 'forgot',
    });
    assertEquals(res.status, 200);
    const { data: rows } = await admin.from('punch_edit_requests').select('*').eq('employee_id', id);
    assertEquals(rows?.length, 1);
    assertEquals(rows![0].status, 'pending');
    await cleanup();
  }});

Deno.test({ name: "submit-edit-request: future time → 400 FUTURE_TIME", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const { jwt } = await makeEmployee('emp2@test.local');
    const future = new Date(Date.now() + 60*60*1000).toISOString();
    const res = await submit(jwt, { requested_kind: 'in', requested_time: future, reason: 'lol' });
    assertEquals(res.status, 400);
    assertEquals((await res.json()).error, 'FUTURE_TIME');
    await cleanup();
  }});

Deno.test({ name: "submit-edit-request: empty reason → 400 BAD_REASON", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const { jwt } = await makeEmployee('emp3@test.local');
    const res = await submit(jwt, {
      requested_kind: 'in',
      requested_time: new Date(Date.now() - 60_000).toISOString(),
      reason: '',
    });
    assertEquals(res.status, 400);
    assertEquals((await res.json()).error, 'BAD_REASON');
    await cleanup();
  }});
