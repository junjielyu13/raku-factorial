// supabase/functions/reject-edit/test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;
const FUNC_URL     = `${SUPABASE_URL}/functions/v1/reject-edit`;
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

Deno.test({ name: "reject-edit: admin rejects → 200, status=rejected, no effective row", sanitizeResources: false, sanitizeOps: false,
  async fn() {
    await cleanup();
    const emp  = await makeUser('emp@test.local', 'employee');
    const boss = await makeUser('boss@test.local', 'admin');
    const { data: r } = await admin.from('punch_edit_requests').insert({
      employee_id: emp.id, requested_kind: 'in',
      requested_time: new Date(Date.now() - 3600_000).toISOString(),
      reason: 'forgot',
    }).select('id').single();
    const reqId = r!.id;

    const res = await fetch(FUNC_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${boss.jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: reqId, note: 'not approved' }),
    });
    assertEquals(res.status, 200);

    const { data: req } = await admin.from('punch_edit_requests').select('status').eq('id', reqId).single();
    assertEquals(req!.status, 'rejected');
    const { data: effs } = await admin.from('effective_punches').select('*').eq('source_request_id', reqId);
    assertEquals(effs?.length, 0);
    await cleanup();
  }});
