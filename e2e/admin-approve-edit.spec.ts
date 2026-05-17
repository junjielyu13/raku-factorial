// e2e/admin-approve-edit.spec.ts
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SERVICE_KEY  = execSync("supabase status -o json | jq -r .SERVICE_ROLE_KEY").toString().trim();
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function makeUser(email: string, role: 'admin' | 'employee') {
  const { data: u } = await admin.auth.admin.createUser({
    email, password: 'e2e-pw-12345', email_confirm: true,
  });
  await admin.from('employees').insert({
    id: u!.user!.id, email, full_name: email.split('@')[0], role,
  });
  return u!.user!.id;
}

async function loginAs(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login');
  await page.waitForFunction(() => Boolean((window as unknown as { supabase?: unknown }).supabase));
  await page.evaluate(async ({ e, pw }) => {
    await (window as unknown as { supabase: { auth: { signInWithPassword: (args: { email: string; password: string }) => Promise<unknown> } } })
      .supabase.auth.signInWithPassword({ email: e, password: pw });
  }, { e: email, pw: 'e2e-pw-12345' });
  // Wait for session to be persisted in localStorage before navigating
  await page.waitForFunction(() => {
    const keys = Object.keys(localStorage);
    return keys.some(k => k.includes('auth-token'));
  });
  await page.goto('/admin/approvals');
}

async function cleanup() {
  await admin.from('effective_punches').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('punch_edit_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('employees').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const { data } = await admin.auth.admin.listUsers();
  for (const u of data?.users ?? []) await admin.auth.admin.deleteUser(u.id);
}

test.beforeAll(cleanup);
test.afterAll(cleanup);

test('admin approves a pending edit request', async ({ page }) => {
  const empId = await makeUser('e2e-emp@test.local', 'employee');
  await makeUser('e2e-boss@test.local', 'admin');

  await admin.from('punch_edit_requests').insert({
    employee_id: empId, requested_kind: 'in',
    requested_time: new Date(Date.now() - 60*60*1000).toISOString(),
    reason: 'forgot to punch',
  });

  await loginAs(page, 'e2e-boss@test.local');
  await expect(page.getByText('forgot to punch')).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: '通过' }).click();
  await expect(page.getByText('forgot to punch')).toHaveCount(0, { timeout: 10000 });

  const { data } = await admin.from('effective_punches').select('*').eq('employee_id', empId);
  expect(data?.length).toBe(1);
});
