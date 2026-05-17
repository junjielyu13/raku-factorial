// supabase/functions/export-month/test.ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;
const FUNC_URL     = `${SUPABASE_URL}/functions/v1/export-month`;
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
  await admin.from('punches').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('employees').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const { data } = await admin.auth.admin.listUsers();
  for (const u of data?.users ?? []) await admin.auth.admin.deleteUser(u.id);
}

Deno.test({ name: "export-month: admin → CSV with header and rows", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const emp  = await makeUser('emp@test.local', 'employee');
    const boss = await makeUser('boss@test.local', 'admin');
    const office = (await admin.from('office_locations').select('id').limit(1).single()).data!.id;

    // 1 paired punch
    const t0 = new Date('2026-05-05T09:00:00Z');
    const t1 = new Date('2026-05-05T17:00:00Z');
    const { data: p1 } = await admin.from('punches').insert({
      employee_id: emp.id, kind: 'in', recorded_at: t0.toISOString(),
      latitude: 40.4, longitude: -3.7, office_id: office,
    }).select('id').single();
    const { data: p2 } = await admin.from('punches').insert({
      employee_id: emp.id, kind: 'out', recorded_at: t1.toISOString(),
      latitude: 40.4, longitude: -3.7, office_id: office,
    }).select('id').single();
    await admin.from('effective_punches').insert([
      { employee_id: emp.id, kind: 'in',  effective_time: t0.toISOString(), source_punch_id: p1!.id },
      { employee_id: emp.id, kind: 'out', effective_time: t1.toISOString(), source_punch_id: p2!.id },
    ]);

    const url = new URL(FUNC_URL);
    url.searchParams.set('month', '2026-05');
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${boss.jwt}` },
    });
    assertEquals(res.status, 200);
    assertEquals(res.headers.get('content-type'), 'text/csv; charset=utf-8');
    const csv = await res.text();
    assert(csv.includes('employee_email'), 'expected header');
    assert(csv.includes('emp@test.local'), 'expected employee row');
    assert(csv.includes('2026-05-05'), 'expected the work date');
    await cleanup();
  }});

Deno.test({ name: "export-month: employee → only sees own rows", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const alice = await makeUser('alice@test.local', 'employee');
    const bob   = await makeUser('bob@test.local',   'employee');
    const office = (await admin.from('office_locations').select('id').limit(1).single()).data!.id;
    const t0 = new Date('2026-05-05T09:00:00Z');
    const t1 = new Date('2026-05-05T17:00:00Z');
    for (const emp of [alice, bob]) {
      const { data: pi } = await admin.from('punches').insert({
        employee_id: emp.id, kind: 'in', recorded_at: t0.toISOString(),
        latitude: 40.4, longitude: -3.7, office_id: office,
      }).select('id').single();
      const { data: po } = await admin.from('punches').insert({
        employee_id: emp.id, kind: 'out', recorded_at: t1.toISOString(),
        latitude: 40.4, longitude: -3.7, office_id: office,
      }).select('id').single();
      await admin.from('effective_punches').insert([
        { employee_id: emp.id, kind: 'in',  effective_time: t0.toISOString(), source_punch_id: pi!.id },
        { employee_id: emp.id, kind: 'out', effective_time: t1.toISOString(), source_punch_id: po!.id },
      ]);
    }

    const url = new URL(FUNC_URL);
    url.searchParams.set('month', '2026-05');
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${alice.jwt}` } });
    const csv = await res.text();
    assert(csv.includes('alice@test.local'));
    assert(!csv.includes('bob@test.local'), 'employee should not see other employees');
    await cleanup();
  }});

Deno.test({ name: "export-month: totals section shows monthly_hours per employee", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const emp  = await makeUser('totals@test.local', 'employee');
    const boss = await makeUser('boss-totals@test.local', 'admin');
    const office = (await admin.from('office_locations').select('id').limit(1).single()).data!.id;
    const t0 = new Date('2026-05-05T09:00:00Z');
    const t1 = new Date('2026-05-05T17:00:00Z');
    const { data: pi } = await admin.from('punches').insert({
      employee_id: emp.id, kind: 'in', recorded_at: t0.toISOString(),
      latitude: 40.4, longitude: -3.7, office_id: office,
    }).select('id').single();
    const { data: po } = await admin.from('punches').insert({
      employee_id: emp.id, kind: 'out', recorded_at: t1.toISOString(),
      latitude: 40.4, longitude: -3.7, office_id: office,
    }).select('id').single();
    await admin.from('effective_punches').insert([
      { employee_id: emp.id, kind: 'in',  effective_time: t0.toISOString(), source_punch_id: pi!.id },
      { employee_id: emp.id, kind: 'out', effective_time: t1.toISOString(), source_punch_id: po!.id },
    ]);

    const url = new URL(FUNC_URL);
    url.searchParams.set('month', '2026-05');
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${boss.jwt}` } });
    const csv = await res.text();
    assert(csv.includes('worked_total_hours'), 'expected totals header');
    assert(csv.includes('totals@test.local,8.00'), `expected 8.00h total for emp; got:\n${csv}`);
    await cleanup();
  }});
