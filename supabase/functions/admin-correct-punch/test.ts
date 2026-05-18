// supabase/functions/admin-correct-punch/test.ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;
const FUNC_URL     = `${SUPABASE_URL}/functions/v1/admin-correct-punch`;
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

// effective_punches 与 punch_edit_requests 互相外键引用，清理需先断开指针再删。
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

// 直接造一条有效打卡，作为 modify/delete 的目标。
async function seedEffectivePunch(employeeId: string, kind: 'in' | 'out' = 'in') {
  const ts = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const { data: req } = await admin.from('punch_edit_requests').insert({
    employee_id: employeeId, requested_kind: kind, requested_time: ts,
    reason: 'seed', action: 'add', status: 'approved',
  }).select('id').single();
  const { data: eff } = await admin.from('effective_punches').insert({
    employee_id: employeeId, kind, effective_time: ts, source_request_id: req!.id,
  }).select('id').single();
  return eff!.id as string;
}

async function call(jwt: string, body: unknown) {
  return fetch(FUNC_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

Deno.test({ name: "admin-correct-punch: add → 200, new effective_punches row", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const emp  = await makeUser('emp@test.local', 'employee');
    const boss = await makeUser('boss@test.local', 'admin');

    const when = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const res = await call(boss.jwt, {
      action: 'add', employee_id: emp.id, kind: 'in', time: when, reason: 'forgot to clock in',
    });
    assertEquals(res.status, 200);

    const { data: effs } = await admin.from('effective_punches').select('*').eq('employee_id', emp.id);
    assertEquals(effs?.length, 1);
    assert(effs![0].source_request_id !== null);

    const { data: reqs } = await admin.from('punch_edit_requests')
      .select('action, created_by, status').eq('employee_id', emp.id);
    assertEquals(reqs?.length, 1);
    assertEquals(reqs![0].action, 'add');
    assertEquals(reqs![0].created_by, boss.id);
    assertEquals(reqs![0].status, 'approved');
    await cleanup();
  }});

Deno.test({ name: "admin-correct-punch: modify → old superseded, new active row", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const emp  = await makeUser('emp2@test.local', 'employee');
    const boss = await makeUser('boss2@test.local', 'admin');
    const targetId = await seedEffectivePunch(emp.id, 'in');

    const newTime = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    const res = await call(boss.jwt, {
      action: 'modify', target_effective_id: targetId, kind: 'in', time: newTime, reason: 'wrong time',
    });
    assertEquals(res.status, 200);

    const { data: old } = await admin.from('effective_punches')
      .select('superseded_at, superseded_by_request_id').eq('id', targetId).single();
    assert(old!.superseded_at !== null);
    assert(old!.superseded_by_request_id !== null);

    const { data: active } = await admin.from('effective_punches')
      .select('*').eq('employee_id', emp.id).is('superseded_at', null);
    assertEquals(active?.length, 1);
    // Compare as instants: Postgres serializes timestamptz as +00:00, JS toISOString() as Z.
    assertEquals(
      new Date(active![0].effective_time as string).getTime(),
      new Date(newTime).getTime(),
    );
    await cleanup();
  }});

Deno.test({ name: "admin-correct-punch: delete → target superseded, no new row", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const emp  = await makeUser('emp3@test.local', 'employee');
    const boss = await makeUser('boss3@test.local', 'admin');
    const targetId = await seedEffectivePunch(emp.id, 'out');

    const res = await call(boss.jwt, {
      action: 'delete', target_effective_id: targetId, reason: 'double punch',
    });
    assertEquals(res.status, 200);

    const { data: active } = await admin.from('effective_punches')
      .select('id').eq('employee_id', emp.id).is('superseded_at', null);
    assertEquals(active?.length, 0);

    const { data: reqs } = await admin.from('punch_edit_requests')
      .select('action').eq('employee_id', emp.id).eq('action', 'delete');
    assertEquals(reqs?.length, 1);
    await cleanup();
  }});

Deno.test({ name: "admin-correct-punch: non-admin → 403 NOT_ADMIN", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const emp = await makeUser('emp4@test.local', 'employee');
    const res = await call(emp.jwt, {
      action: 'add', employee_id: emp.id, kind: 'in',
      time: new Date(Date.now() - 3600_000).toISOString(), reason: 'x',
    });
    assertEquals(res.status, 403);
    assertEquals((await res.json()).error, 'NOT_ADMIN');
    await cleanup();
  }});

Deno.test({ name: "admin-correct-punch: modify already-superseded → 409 ALREADY_CHANGED", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const emp  = await makeUser('emp5@test.local', 'employee');
    const boss = await makeUser('boss5@test.local', 'admin');
    const targetId = await seedEffectivePunch(emp.id, 'in');

    const r1 = await call(boss.jwt, { action: 'delete', target_effective_id: targetId, reason: 'void' });
    assertEquals(r1.status, 200);

    const r2 = await call(boss.jwt, {
      action: 'modify', target_effective_id: targetId, kind: 'in',
      time: new Date(Date.now() - 3600_000).toISOString(), reason: 'too late',
    });
    assertEquals(r2.status, 409);
    assertEquals((await r2.json()).error, 'ALREADY_CHANGED');
    await cleanup();
  }});
