// supabase/functions/admin-backfill-week/test.ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;
const FUNC_URL     = `${SUPABASE_URL}/functions/v1/admin-backfill-week`;
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
  await admin.from('effective_punches').update({ superseded_by_request_id: null })
    .neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('punch_edit_requests').update({ target_effective_id: null })
    .neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('effective_punches').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('punch_edit_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('employees').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const { data } = await admin.auth.admin.listUsers();
  for (const u of data?.users ?? []) await admin.auth.admin.deleteUser(u.id);
}

async function call(jwt: string, body: unknown) {
  return fetch(FUNC_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

Deno.test({ name: "admin-backfill-week: adds every punch atomically → effective rows + approved requests", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const emp  = await makeUser('emp@test.local', 'employee');
    const boss = await makeUser('boss@test.local', 'admin');

    const t1 = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const t2 = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const res = await call(boss.jwt, {
      employee_id: emp.id, reason: 'bulk backfill',
      punches: [{ kind: 'in', time: t1 }, { kind: 'out', time: t2 }],
    });
    assertEquals(res.status, 200);
    assertEquals((await res.json()).count, 2);

    const { data: effs } = await admin.from('effective_punches').select('kind').eq('employee_id', emp.id);
    assertEquals(effs?.length, 2);

    const { data: reqs } = await admin.from('punch_edit_requests')
      .select('action, created_by, status').eq('employee_id', emp.id);
    assertEquals(reqs?.length, 2);
    assert(reqs!.every(r => r.action === 'add' && r.created_by === boss.id && r.status === 'approved'));
    await cleanup();
  }});

Deno.test({ name: "admin-backfill-week: a future time rejects the whole batch, writing nothing", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const emp  = await makeUser('emp2@test.local', 'employee');
    const boss = await makeUser('boss2@test.local', 'admin');

    const past   = new Date(Date.now() - 3600_000).toISOString();
    const future = new Date(Date.now() + 3600_000).toISOString();
    const res = await call(boss.jwt, {
      employee_id: emp.id, reason: 'x',
      punches: [{ kind: 'in', time: past }, { kind: 'out', time: future }],
    });
    assertEquals(res.status, 400);

    // Nothing written: the valid first punch must have rolled back with the bad one.
    const { data: effs } = await admin.from('effective_punches').select('id').eq('employee_id', emp.id);
    assertEquals(effs?.length, 0);
    await cleanup();
  }});

Deno.test({ name: "admin-backfill-week: non-admin → 403 NOT_ADMIN", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const emp = await makeUser('emp3@test.local', 'employee');
    const res = await call(emp.jwt, {
      employee_id: emp.id, reason: 'x',
      punches: [{ kind: 'in', time: new Date(Date.now() - 3600_000).toISOString() }],
    });
    assertEquals(res.status, 403);
    assertEquals((await res.json()).error, 'NOT_ADMIN');
    await cleanup();
  }});
