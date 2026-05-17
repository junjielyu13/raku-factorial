// e2e/employee-punch-in.spec.ts
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SERVICE_KEY  = execSync("supabase status -o json | jq -r .SERVICE_ROLE_KEY").toString().trim();
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function seedEmployeeAndLogin(page: import('@playwright/test').Page, email: string) {
  const { data: u } = await admin.auth.admin.createUser({
    email, password: 'e2e-pw-12345', email_confirm: true,
  });
  const userId = u!.user!.id;
  await admin.from('employees').insert({
    id: userId, email, full_name: 'E2E Tester', role: 'employee',
  });
  // Drive login via SPA's own supabase instance (exposed on window in DEV)
  await page.goto('/login');
  await page.waitForFunction(() => Boolean((window as unknown as { supabase?: unknown }).supabase));
  await page.evaluate(async ({ e, pw }) => {
    await (window as unknown as { supabase: { auth: { signInWithPassword: (args: { email: string; password: string }) => Promise<unknown> } } })
      .supabase.auth.signInWithPassword({ email: e, password: pw });
  }, { e: email, pw: 'e2e-pw-12345' });
  await page.goto('/');
}

async function cleanup() {
  await admin.from('effective_punches').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('punch_edit_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('punches').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('employees').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const { data } = await admin.auth.admin.listUsers();
  for (const u of data?.users ?? []) await admin.auth.admin.deleteUser(u.id);
}

test.beforeAll(cleanup);
test.afterAll(cleanup);

test('employee punches in successfully', async ({ page }) => {
  await seedEmployeeAndLogin(page, 'e2e-emp@test.local');
  await page.getByRole('button', { name: '上班打卡' }).click();
  // After successful punch the today list shows "上班"
  await expect(page.getByText('上班', { exact: true })).toBeVisible({ timeout: 10000 });
});
