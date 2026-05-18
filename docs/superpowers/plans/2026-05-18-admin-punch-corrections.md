# 管理员代补卡 / 打卡修正 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让管理员能在看板上修改、补登、删除员工打卡，每个动作都留完整审计轨迹。

**Architecture:** `punch_edit_requests` 扩展为统一的修正审计日志（新增 `created_by` / `action` / `target_effective_id`）；`effective_punches` 新增软删除标记（`superseded_at` / `superseded_by_request_id`）。一个原子 RPC `admin_correct_punch` 处理三种操作，经一个 admin-only 的 Edge Function 调用。所有报表查询排除已取代记录。

**Tech Stack:** Postgres (Supabase) · Deno Edge Functions · React 19 + TypeScript + Tailwind v3

设计文档：`docs/superpowers/specs/2026-05-18-admin-punch-corrections-design.md`

---

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `supabase/migrations/20260518000002_admin_corrections.sql` | 创建 | 表列、RPC、视图替换、授权 |
| `supabase/functions/admin-correct-punch/index.ts` | 创建 | admin-only Edge Function，校验后调 RPC |
| `supabase/functions/admin-correct-punch/test.ts` | 创建 | Deno 集成测试 |
| `src/lib/types.ts` | 修改 | 扩展 `EffectivePunch` / `PunchEditRequest` |
| `src/lib/api.ts` | 修改 | 新增 `adminCorrectPunch` 封装 |
| `src/i18n/messages.ts` | 修改 | 新增 `admin.correct.*` 与 `admin.table.actions` |
| `src/components/PunchCorrectionModal.tsx` | 创建 | 补登/修改/删除三模式弹窗 |
| `src/admin/AdminDashboard.tsx` | 修改 | 行内改/删按钮、补登按钮、已修正徽标、排除已取代行 |
| `src/employee/EmployeeHistory.tsx` | 修改 | 查询排除已取代行 |
| `src/employee/EmployeeHome.tsx` | 修改 | 查询排除已取代行 |
| `supabase/functions/export-month/index.ts` | 修改 | 查询排除已取代行 |

---

## Task 1：数据库迁移

**Files:**
- Create: `supabase/migrations/20260518000002_admin_corrections.sql`

- [ ] **Step 1：写迁移文件**

`supabase/migrations/20260518000002_admin_corrections.sql`：

```sql
-- 20260518000002_admin_corrections.sql
-- 管理员代补卡 / 打卡修正：审计列、软删除列、RPC、视图更新。

-- 1. punch_edit_requests：统一修正审计日志的新列
ALTER TABLE public.punch_edit_requests
  ADD COLUMN created_by uuid REFERENCES public.employees(id),
  ADD COLUMN action text NOT NULL DEFAULT 'add'
    CHECK (action IN ('add', 'modify', 'delete')),
  ADD COLUMN target_effective_id uuid REFERENCES public.effective_punches(id);

-- 2. effective_punches：软删除二元组
ALTER TABLE public.effective_punches
  ADD COLUMN superseded_at timestamptz,
  ADD COLUMN superseded_by_request_id uuid REFERENCES public.punch_edit_requests(id);

-- 3. 管理员修正 RPC（原子）
CREATE OR REPLACE FUNCTION public.admin_correct_punch(
  p_admin_id            uuid,
  p_action              text,
  p_target_effective_id uuid,
  p_employee_id         uuid,
  p_kind                text,
  p_time                timestamptz,
  p_reason              text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target public.effective_punches%ROWTYPE;
  v_req_id uuid;
BEGIN
  IF p_action NOT IN ('add', 'modify', 'delete') THEN
    RAISE EXCEPTION 'bad action' USING ERRCODE = 'P0002';
  END IF;

  -- add：员工从未打过的卡
  IF p_action = 'add' THEN
    INSERT INTO public.punch_edit_requests
      (employee_id, requested_kind, requested_time, reason,
       action, status, created_by, reviewed_by, reviewed_at)
    VALUES
      (p_employee_id, p_kind, p_time, p_reason,
       'add', 'approved', p_admin_id, p_admin_id, now())
    RETURNING id INTO v_req_id;

    INSERT INTO public.effective_punches
      (employee_id, kind, effective_time, source_request_id)
    VALUES
      (p_employee_id, p_kind, p_time, v_req_id);
    RETURN;
  END IF;

  -- modify / delete：都需要一条已存在的目标有效记录
  SELECT * INTO v_target FROM public.effective_punches
    WHERE id = p_target_effective_id FOR UPDATE;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'effective punch not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_target.superseded_at IS NOT NULL THEN
    RAISE EXCEPTION 'already superseded' USING ERRCODE = 'P0001';
  END IF;

  IF p_action = 'modify' THEN
    INSERT INTO public.punch_edit_requests
      (employee_id, original_punch_id, target_effective_id,
       requested_kind, requested_time, reason,
       action, status, created_by, reviewed_by, reviewed_at)
    VALUES
      (v_target.employee_id, v_target.source_punch_id, v_target.id,
       p_kind, p_time, p_reason,
       'modify', 'approved', p_admin_id, p_admin_id, now())
    RETURNING id INTO v_req_id;

    INSERT INTO public.effective_punches
      (employee_id, kind, effective_time, source_request_id)
    VALUES
      (v_target.employee_id, p_kind, p_time, v_req_id);
  ELSE
    -- delete：把被作废打卡的 kind/time 记进审计，不产生新有效记录
    INSERT INTO public.punch_edit_requests
      (employee_id, original_punch_id, target_effective_id,
       requested_kind, requested_time, reason,
       action, status, created_by, reviewed_by, reviewed_at)
    VALUES
      (v_target.employee_id, v_target.source_punch_id, v_target.id,
       v_target.kind, v_target.effective_time, p_reason,
       'delete', 'approved', p_admin_id, p_admin_id, now())
    RETURNING id INTO v_req_id;
  END IF;

  UPDATE public.effective_punches
    SET superseded_at = now(), superseded_by_request_id = v_req_id
    WHERE id = v_target.id;
END;
$$;

-- 仅 service_role（Edge Function）可执行
REVOKE EXECUTE ON FUNCTION public.admin_correct_punch FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_correct_punch TO service_role;

-- 4. daily_worked 视图：排除已取代的有效记录（列清单不变，CREATE OR REPLACE 安全）
CREATE OR REPLACE VIEW public.daily_worked AS
WITH paired AS (
  SELECT
    ep.employee_id,
    ep.effective_time AS in_time,
    LEAD(ep.effective_time) OVER (
      PARTITION BY ep.employee_id ORDER BY ep.effective_time
    ) AS next_time,
    ep.kind,
    LEAD(ep.kind) OVER (
      PARTITION BY ep.employee_id ORDER BY ep.effective_time
    ) AS next_kind
  FROM public.effective_punches ep
  WHERE ep.superseded_at IS NULL
)
SELECT
  employee_id,
  (in_time AT TIME ZONE 'Europe/Madrid')::date AS work_date,
  in_time,
  next_time AS out_time,
  (next_time - in_time) AS duration
FROM paired
WHERE kind = 'in' AND next_kind = 'out';

ALTER VIEW public.daily_worked SET (security_invoker = on);
```

- [ ] **Step 2：本地应用迁移**

前提：Docker Desktop 已运行。

Run: `supabase db reset`
Expected: 全部迁移按序执行，结尾输出 `Finished supabase db reset.`，无报错。

- [ ] **Step 3：提交**

```bash
git add supabase/migrations/20260518000002_admin_corrections.sql
git commit -m "$(cat <<'EOF'
feat(db): admin punch correction columns, RPC, superseded filter

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2：Edge Function `admin-correct-punch`（TDD）

**Files:**
- Create: `supabase/functions/admin-correct-punch/test.ts`
- Create: `supabase/functions/admin-correct-punch/index.ts`

- [ ] **Step 1：写失败测试**

`supabase/functions/admin-correct-punch/test.ts`：

```ts
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
    assertEquals(active![0].effective_time, newTime);
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
```

- [ ] **Step 2：运行测试，确认失败**

前提：`supabase start` 已运行（Docker）。先在一个独立终端启动函数运行时（保持运行）：

```bash
supabase functions serve admin-correct-punch
```

另一个终端运行测试：

```bash
export SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o json | jq -r .SERVICE_ROLE_KEY)
export SUPABASE_ANON_KEY=$(supabase status -o json | jq -r .ANON_KEY)
deno test --allow-net --allow-env supabase/functions/admin-correct-punch/test.ts
```

Expected: FAIL —— `index.ts` 还不存在，函数返回非 200（404 / BOOT_ERROR），所有 `assertEquals(res.status, 200/403/409)` 不通过。

- [ ] **Step 3：写实现**

`supabase/functions/admin-correct-punch/index.ts`：

```ts
// supabase/functions/admin-correct-punch/index.ts
import {
  authenticate, requireAdmin, adminClient, jsonResponse,
  handleCors, errorResponse, HttpError,
} from "../_shared/auth.ts";

interface Body {
  action: 'add' | 'modify' | 'delete';
  target_effective_id?: string;
  employee_id?: string;
  kind?: 'in' | 'out';
  time?: string;          // ISO timestamp
  reason: string;
}

Deno.serve(async (req) => {
  try {
    const cors = handleCors(req);
    if (cors) return cors;
    if (req.method !== 'POST') throw new HttpError(405, 'METHOD');

    const user = await authenticate(req);
    requireAdmin(user);

    const body = await req.json() as Body;

    if (body.action !== 'add' && body.action !== 'modify' && body.action !== 'delete')
      throw new HttpError(400, 'BAD_ACTION');
    if (typeof body.reason !== 'string' || body.reason.trim().length === 0)
      throw new HttpError(400, 'BAD_REASON');

    let kind: string | null = null;
    let timeIso: string | null = null;

    if (body.action === 'add' || body.action === 'modify') {
      if (body.kind !== 'in' && body.kind !== 'out')
        throw new HttpError(400, 'BAD_KIND');
      kind = body.kind;
      const when = new Date(body.time ?? '');
      if (isNaN(when.getTime())) throw new HttpError(400, 'BAD_TIME');
      if (when.getTime() > Date.now()) throw new HttpError(400, 'FUTURE_TIME');
      timeIso = when.toISOString();
    }
    if (body.action === 'add' && !body.employee_id)
      throw new HttpError(400, 'BAD_EMPLOYEE');
    if ((body.action === 'modify' || body.action === 'delete') && !body.target_effective_id)
      throw new HttpError(400, 'BAD_TARGET');

    const admin = adminClient();
    const { error } = await admin.rpc('admin_correct_punch', {
      p_admin_id:            user.id,
      p_action:              body.action,
      p_target_effective_id: body.target_effective_id ?? null,
      p_employee_id:         body.employee_id ?? null,
      p_kind:                kind,
      p_time:                timeIso,
      p_reason:              body.reason.trim(),
    });
    if (error) {
      if (error.code === 'P0001') throw new HttpError(409, 'ALREADY_CHANGED');
      if (error.code === 'P0002') throw new HttpError(404, 'NOT_FOUND');
      throw error;
    }

    return jsonResponse(200, { ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});
```

- [ ] **Step 4：运行测试，确认通过**

`supabase functions serve` 会自动重载新函数。重跑：

```bash
deno test --allow-net --allow-env supabase/functions/admin-correct-punch/test.ts
```

Expected: PASS —— 5 个测试全部通过（`ok | 5 passed`）。

- [ ] **Step 5：提交**

```bash
git add supabase/functions/admin-correct-punch/
git commit -m "$(cat <<'EOF'
feat(edge): admin-correct-punch function for modify/add/delete

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3：类型与 API 封装

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/api.ts`

- [ ] **Step 1：扩展 `types.ts`**

把 `src/lib/types.ts` 里的 `EffectivePunch` 与 `PunchEditRequest` 两个接口整体替换为：

```ts
export interface EffectivePunch {
  id: string;
  employee_id: string;
  kind: 'in' | 'out';
  effective_time: string;
  source_punch_id: string | null;
  source_request_id: string | null;
  superseded_at: string | null;
  superseded_by_request_id: string | null;
}

export interface PunchEditRequest {
  id: string;
  employee_id: string;
  original_punch_id: string | null;
  requested_kind: 'in' | 'out';
  requested_time: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  created_by: string | null;
  action: 'add' | 'modify' | 'delete';
  target_effective_id: string | null;
}
```

- [ ] **Step 2：在 `api.ts` 末尾新增封装**

在 `src/lib/api.ts` 末尾（`exportMonthCsv` 函数之后）追加：

```ts
export function adminCorrectPunch(args: {
  action: 'add' | 'modify' | 'delete';
  reason: string;
  target_effective_id?: string;
  employee_id?: string;
  kind?: 'in' | 'out';
  time?: string;
}) {
  return invoke<{ ok: true }>('admin-correct-punch', args);
}
```

- [ ] **Step 3：构建验证**

Run: `npm run build`
Expected: PASS（tsc 无报错，vite build 成功）。

- [ ] **Step 4：提交**

```bash
git add src/lib/types.ts src/lib/api.ts
git commit -m "$(cat <<'EOF'
feat(fe): types + api wrapper for admin punch corrections

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4：i18n 文案

**Files:**
- Modify: `src/i18n/messages.ts`

- [ ] **Step 1：扩展 `Messages` 接口**

在 `Messages` 接口的 `admin.table` 对象里，`warn: string;` 这一行之后新增一行：

```ts
      actions: string;
```

在 `Messages` 接口的 `admin` 对象里，`export: { ... };` 整块之后新增 `correct` 块：

```ts
    correct: {
      modify: string;
      delete: string;
      addPunch: string;
      modalAddTitle: string;
      modalModifyTitle: string;
      modalDeleteTitle: string;
      employeeLabel: string;
      typeLabel: string;
      timeLabel: string;
      reasonLabel: string;
      reasonPlaceholder: string;
      selectEmployee: string;
      save: string;
      saving: string;
      cancel: string;
      confirmDelete: string;
      correctedBadge: string;
      errors: Record<string, string>;
    };
```

- [ ] **Step 2：在三种语言里加文案**

`zh` 的 `admin.table` 里，`warn: '⚠️',` 之后加 `actions: '操作',`。
`zh` 的 `admin` 里，`export: { ... },` 之后加：

```ts
      correct: {
        modify: '修改',
        delete: '删除',
        addPunch: '补登打卡',
        modalAddTitle: '补登打卡',
        modalModifyTitle: '修改打卡',
        modalDeleteTitle: '删除打卡',
        employeeLabel: '员工',
        typeLabel: '类型',
        timeLabel: '时间',
        reasonLabel: '原因',
        reasonPlaceholder: '请填写修正原因（审计留存）',
        selectEmployee: '选择员工',
        save: '保存',
        saving: '保存中…',
        cancel: '取消',
        confirmDelete: '确认删除',
        correctedBadge: '已修正',
        errors: {
          BAD_ACTION: '操作类型不正确。',
          BAD_REASON: '原因不能为空。',
          BAD_KIND: '类型不正确。',
          BAD_TIME: '时间格式不正确。',
          FUTURE_TIME: '时间不能是未来。',
          BAD_EMPLOYEE: '请选择员工。',
          BAD_TARGET: '未找到目标打卡。',
          ALREADY_CHANGED: '这条打卡已被修改过，请刷新后重试。',
          NOT_FOUND: '未找到目标打卡。',
          NOT_ADMIN: '需要管理员权限。',
          UNKNOWN: '操作失败：{code}',
        },
      },
```

`en` 的 `admin.table` 里，`warn: '⚠️',` 之后加 `actions: 'Actions',`。
`en` 的 `admin` 里，`export: { ... },` 之后加：

```ts
      correct: {
        modify: 'Modify',
        delete: 'Delete',
        addPunch: 'Add punch',
        modalAddTitle: 'Add punch',
        modalModifyTitle: 'Modify punch',
        modalDeleteTitle: 'Delete punch',
        employeeLabel: 'Employee',
        typeLabel: 'Type',
        timeLabel: 'Time',
        reasonLabel: 'Reason',
        reasonPlaceholder: 'Reason for the correction (kept for audit)',
        selectEmployee: 'Select employee',
        save: 'Save',
        saving: 'Saving…',
        cancel: 'Cancel',
        confirmDelete: 'Confirm delete',
        correctedBadge: 'corrected',
        errors: {
          BAD_ACTION: 'Invalid action.',
          BAD_REASON: 'Reason is required.',
          BAD_KIND: 'Invalid type.',
          BAD_TIME: 'Invalid time format.',
          FUTURE_TIME: 'Time cannot be in the future.',
          BAD_EMPLOYEE: 'Please select an employee.',
          BAD_TARGET: 'Target punch not found.',
          ALREADY_CHANGED: 'This punch was already changed. Refresh and retry.',
          NOT_FOUND: 'Target punch not found.',
          NOT_ADMIN: 'Admin privileges required.',
          UNKNOWN: 'Action failed: {code}',
        },
      },
```

`es` 的 `admin.table` 里，`warn: '⚠️',` 之后加 `actions: 'Acciones',`。
`es` 的 `admin` 里，`export: { ... },` 之后加：

```ts
      correct: {
        modify: 'Modificar',
        delete: 'Eliminar',
        addPunch: 'Añadir fichaje',
        modalAddTitle: 'Añadir fichaje',
        modalModifyTitle: 'Modificar fichaje',
        modalDeleteTitle: 'Eliminar fichaje',
        employeeLabel: 'Empleado',
        typeLabel: 'Tipo',
        timeLabel: 'Hora',
        reasonLabel: 'Motivo',
        reasonPlaceholder: 'Motivo de la corrección (se conserva para auditoría)',
        selectEmployee: 'Seleccionar empleado',
        save: 'Guardar',
        saving: 'Guardando…',
        cancel: 'Cancelar',
        confirmDelete: 'Confirmar eliminación',
        correctedBadge: 'corregido',
        errors: {
          BAD_ACTION: 'Acción no válida.',
          BAD_REASON: 'El motivo es obligatorio.',
          BAD_KIND: 'Tipo no válido.',
          BAD_TIME: 'Formato de hora no válido.',
          FUTURE_TIME: 'La hora no puede ser futura.',
          BAD_EMPLOYEE: 'Selecciona un empleado.',
          BAD_TARGET: 'Fichaje objetivo no encontrado.',
          ALREADY_CHANGED: 'Este fichaje ya se modificó. Actualiza e inténtalo de nuevo.',
          NOT_FOUND: 'Fichaje objetivo no encontrado.',
          NOT_ADMIN: 'Se requieren privilegios de administrador.',
          UNKNOWN: 'Acción fallida: {code}',
        },
      },
```

- [ ] **Step 3：构建验证**

Run: `npm run build`
Expected: PASS（`Messages` 接口强制三种语言结构一致，缺任一键 tsc 会报错）。

- [ ] **Step 4：提交**

```bash
git add src/i18n/messages.ts
git commit -m "$(cat <<'EOF'
feat(i18n): strings for admin punch corrections (zh/en/es)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5：`PunchCorrectionModal` 组件

**Files:**
- Create: `src/components/PunchCorrectionModal.tsx`

- [ ] **Step 1：创建组件**

`src/components/PunchCorrectionModal.tsx`：

```tsx
// src/components/PunchCorrectionModal.tsx
import { useState } from 'react';
import type { FormEvent } from 'react';
import { adminCorrectPunch } from '../lib/api';
import type { ApiError } from '../lib/api';
import { useTranslation } from '../i18n/LanguageContext';
import { formatDateTime } from '../lib/time';

export interface CorrectionTarget {
  effective_id: string;
  employee_name: string;
  kind: 'in' | 'out';
  effective_time: string;   // ISO
}

interface Props {
  mode: 'add' | 'modify' | 'delete';
  target?: CorrectionTarget;                        // modify/delete 必填
  employees: { id: string; full_name: string }[];   // add 用
  onClose: () => void;
  onDone: () => void;
}

// ISO → datetime-local 输入值（浏览器本地时区，与读回时 new Date(value) 语义一致）
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PunchCorrectionModal({ mode, target, employees, onClose, onDone }: Props) {
  const { t } = useTranslation();
  const [employeeId, setEmployeeId] = useState('');
  const [kind, setKind] = useState<'in' | 'out'>(target?.kind ?? 'in');
  const [datetime, setDatetime] = useState(target ? toLocalInput(target.effective_time) : '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const titleKey =
    mode === 'add' ? 'admin.correct.modalAddTitle'
    : mode === 'modify' ? 'admin.correct.modalModifyTitle'
    : 'admin.correct.modalDeleteTitle';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      if (mode === 'add') {
        await adminCorrectPunch({
          action: 'add', employee_id: employeeId, kind,
          time: new Date(datetime).toISOString(), reason,
        });
      } else if (mode === 'modify') {
        await adminCorrectPunch({
          action: 'modify', target_effective_id: target!.effective_id, kind,
          time: new Date(datetime).toISOString(), reason,
        });
      } else {
        await adminCorrectPunch({
          action: 'delete', target_effective_id: target!.effective_id, reason,
        });
      }
      onDone();
    } catch (e: unknown) {
      const apiErr = e as ApiError;
      const known = t(`admin.correct.errors.${apiErr.code}`, { code: apiErr.code });
      setErr(known.startsWith('admin.correct.errors.')
        ? t('admin.correct.errors.UNKNOWN', { code: apiErr.code })
        : known);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4" onClick={onClose}>
      <div className="app-card w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-slate-900">{t(titleKey)}</h2>

        <form onSubmit={submit} className="space-y-4">
          {mode === 'add' && (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">{t('admin.correct.employeeLabel')}</span>
              <select required value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="app-input">
                <option value="">{t('admin.correct.selectEmployee')}</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
              </select>
            </label>
          )}

          {(mode === 'modify' || mode === 'delete') && target && (
            <div className="text-sm text-slate-600">
              <span className="text-slate-500">{t('admin.correct.employeeLabel')}: </span>
              {target.employee_name}
            </div>
          )}

          {mode === 'delete' && target && (
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {target.kind === 'in' ? t('punch.in') : t('punch.out')} · {formatDateTime(target.effective_time)}
            </div>
          )}

          {(mode === 'add' || mode === 'modify') && (
            <>
              <div className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">{t('admin.correct.typeLabel')}</span>
                <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
                  {(['in', 'out'] as const).map(k => (
                    <button type="button" key={k} onClick={() => setKind(k)}
                      className={`py-2 rounded-md text-sm font-medium transition ${kind === k ? 'bg-white shadow text-slate-900' : 'text-slate-600'}`}>
                      {t(`punch.${k}`)}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">{t('admin.correct.timeLabel')}</span>
                <input type="datetime-local" required value={datetime} onChange={e => setDatetime(e.target.value)} className="app-input" />
              </label>
            </>
          )}

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">{t('admin.correct.reasonLabel')}</span>
            <textarea required value={reason} onChange={e => setReason(e.target.value)} rows={3}
              placeholder={t('admin.correct.reasonPlaceholder')} className="app-input resize-none" />
          </label>

          {err && (
            <div className="rounded-lg bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{err}</div>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-lg bg-white ring-1 ring-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition">
              {t('admin.correct.cancel')}
            </button>
            <button type="submit" disabled={busy}
              className={`flex-1 py-2 rounded-lg text-white font-medium disabled:opacity-60 transition ${mode === 'delete' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
              {busy ? t('admin.correct.saving') : mode === 'delete' ? t('admin.correct.confirmDelete') : t('admin.correct.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2：构建验证**

Run: `npm run build`
Expected: PASS。

- [ ] **Step 3：提交**

```bash
git add src/components/PunchCorrectionModal.tsx
git commit -m "$(cat <<'EOF'
feat(fe): PunchCorrectionModal for add/modify/delete

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6：接入 `AdminDashboard`

**Files:**
- Modify: `src/admin/AdminDashboard.tsx`

- [ ] **Step 1：整体替换 `AdminDashboard.tsx`**

用以下内容整体替换 `src/admin/AdminDashboard.tsx`（改动：`fetchPunches` 提为 `useCallback`、查询加 `.is('superseded_at', null)`、新增操作列与补登按钮、已修正徽标、弹窗状态）：

```tsx
// src/admin/AdminDashboard.tsx
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatTime, formatDate, madridDayRange, madridTodayKey } from '../lib/time';
import { useTranslation } from '../i18n/LanguageContext';
import { LanguagePicker } from '../components/LanguagePicker';
import { LogoutButton } from '../components/LogoutButton';
import { PunchCorrectionModal } from '../components/PunchCorrectionModal';
import type { CorrectionTarget } from '../components/PunchCorrectionModal';
import type { EffectivePunch, Employee } from '../lib/types';

interface Row extends EffectivePunch {
  employee: Pick<Employee, 'full_name' | 'email'>;
  punch: { latitude: number | null; longitude: number | null; accuracy_m: number | null } | null;
}

interface OfficeCoords { latitude: number; longitude: number }
interface EmployeeOption { id: string; full_name: string }

type ModalState =
  | { mode: 'add' }
  | { mode: 'modify' | 'delete'; target: CorrectionTarget };

const FAR_THRESHOLD_M = 2000;

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function distanceToNearestOffice(
  lat: number | null | undefined,
  lng: number | null | undefined,
  offices: OfficeCoords[],
): number | null {
  if (typeof lat !== 'number' || typeof lng !== 'number' || offices.length === 0) return null;
  return Math.min(...offices.map(o => haversineMeters(lat, lng, o.latitude, o.longitude)));
}

function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
}

export function AdminDashboard() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[]>([]);
  const [offices, setOffices] = useState<OfficeCoords[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>(madridTodayKey());
  const [modal, setModal] = useState<ModalState | null>(null);

  useEffect(() => {
    supabase.from('office_locations').select('latitude, longitude').eq('active', true)
      .then(({ data }) => {
        setOffices(((data ?? []) as { latitude: number; longitude: number }[])
          .map(o => ({ latitude: Number(o.latitude), longitude: Number(o.longitude) })));
      });

    supabase.from('employees').select('id, full_name').eq('active', true).order('full_name')
      .then(({ data }) => setEmployees((data as EmployeeOption[]) ?? []));
  }, []);

  const fetchPunches = useCallback(async () => {
    const { start, end } = madridDayRange(selectedDate);
    const { data } = await supabase
      .from('effective_punches')
      .select(`
        *,
        employee:employees!effective_punches_employee_id_fkey(full_name, email),
        punch:punches!effective_punches_source_punch_id_fkey(latitude, longitude, accuracy_m)
      `)
      .is('superseded_at', null)
      .gte('effective_time', start)
      .lt('effective_time', end)
      .order('effective_time', { ascending: false });
    setRows((data as unknown as Row[]) ?? []);
  }, [selectedDate]);

  useEffect(() => {
    fetchPunches();
    const ch = supabase.channel(`punches-${selectedDate}`)
      .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'effective_punches' },
          () => fetchPunches())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [selectedDate, fetchPunches]);

  const visibleRows = filterEmployeeId === 'all'
    ? rows
    : rows.filter(r => r.employee_id === filterEmployeeId);

  return (
    <div className="min-h-full max-w-4xl mx-auto px-4 py-6 space-y-5">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('admin.todayTitle')}</h1>
          <div className="text-sm text-slate-500">{formatDate(new Date(`${selectedDate}T12:00:00Z`).toISOString())}</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link to="/admin/approvals" className="app-btn-ghost">{t('admin.approvalsLink')}</Link>
          <Link to="/admin/export" className="app-btn-ghost">{t('admin.exportLink')}</Link>
          <Link to="/" className="app-btn-ghost">{t('admin.employeeViewLink')}</Link>
          <LanguagePicker />
          <LogoutButton />
        </div>
      </header>

      <div className="flex items-center gap-3 flex-wrap text-sm">
        <label className="flex items-center gap-2">
          <span className="text-slate-600">{t('admin.dateLabel')}</span>
          <input
            type="date"
            value={selectedDate}
            max={madridTodayKey()}
            onChange={e => {
              const v = e.target.value;
              if (v && v > madridTodayKey()) return;
              if (v) setSelectedDate(v);
            }}
            className="px-3 py-1.5 rounded-lg bg-white ring-1 ring-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-slate-600">{t('admin.filterLabel')}</span>
          <select
            value={filterEmployeeId}
            onChange={e => setFilterEmployeeId(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-white ring-1 ring-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            <option value="all">{t('admin.filterAll')}</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.full_name}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => setModal({ mode: 'add' })} className="app-btn-ghost">
          {t('admin.correct.addPunch')}
        </button>
      </div>

      {visibleRows.length === 0 ? (
        <div className="app-card px-4 py-8 text-center text-slate-500 text-sm">{t('admin.noPunchesToday')}</div>
      ) : (
        <div className="app-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider">{t('admin.table.time')}</th>
                <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider">{t('admin.table.person')}</th>
                <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider">{t('admin.table.status')}</th>
                <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider">{t('admin.table.info')}</th>
                <th className="text-center px-3 py-2.5 font-medium text-xs uppercase tracking-wider w-10">{t('admin.table.warn')}</th>
                <th className="text-right px-3 py-2.5 font-medium text-xs uppercase tracking-wider">{t('admin.table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleRows.map(r => {
                const lat = r.punch?.latitude;
                const lng = r.punch?.longitude;
                const hasGps = typeof lat === 'number' && typeof lng === 'number';
                const distM = distanceToNearestOffice(lat, lng, offices);
                const isFar = distM !== null && distM > FAR_THRESHOLD_M;
                const target: CorrectionTarget = {
                  effective_id: r.id,
                  employee_name: r.employee.full_name,
                  kind: r.kind,
                  effective_time: r.effective_time,
                };
                return (
                  <tr key={r.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 whitespace-nowrap font-mono tabular-nums text-slate-900">
                      {formatTime(r.effective_time)}
                      {r.source_request_id && (
                        <span className="ml-1.5 text-xs font-sans text-emerald-600" title={t('admin.correct.correctedBadge')}>
                          ✎
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">{r.employee.full_name}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${r.kind === 'in' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        <span className="leading-none">{r.kind === 'in' ? '▶' : '■'}</span>
                        {r.kind === 'in' ? t('punch.in') : t('punch.out')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {hasGps ? (
                        <a
                          href={`https://www.google.com/maps?q=${lat},${lng}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-emerald-700 hover:underline"
                        >
                          📍 {lat.toFixed(5)}, {lng.toFixed(5)}
                          {typeof r.punch?.accuracy_m === 'number' && ` · ±${Math.round(r.punch.accuracy_m)}m`}
                          {distM !== null && ` · ${t('admin.distanceFromOffice', { distance: formatDistance(distM) })}`}
                        </a>
                      ) : (
                        <span className="text-slate-400">{t('admin.noGps')}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {isFar && <span title={`${Math.round(distM!)}m`}>⚠️</span>}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-right">
                      <button
                        type="button"
                        onClick={() => setModal({ mode: 'modify', target })}
                        className="text-xs text-emerald-700 hover:underline mr-3"
                      >
                        {t('admin.correct.modify')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setModal({ mode: 'delete', target })}
                        className="text-xs text-rose-700 hover:underline"
                      >
                        {t('admin.correct.delete')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <PunchCorrectionModal
          mode={modal.mode}
          target={modal.mode === 'add' ? undefined : modal.target}
          employees={employees}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); fetchPunches(); }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2：构建验证**

Run: `npm run build`
Expected: PASS。

- [ ] **Step 3：提交**

```bash
git add src/admin/AdminDashboard.tsx
git commit -m "$(cat <<'EOF'
feat(admin): per-row modify/delete + add-punch on dashboard

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7：其余 `effective_punches` 消费方排除已取代记录

**Files:**
- Modify: `src/employee/EmployeeHistory.tsx`
- Modify: `src/employee/EmployeeHome.tsx`
- Modify: `supabase/functions/export-month/index.ts`

- [ ] **Step 1：`EmployeeHistory.tsx` 查询加过滤**

把 `src/employee/EmployeeHistory.tsx` 里这一行：

```ts
    let q = supabase.from('effective_punches').select('*').eq('employee_id', profile.id);
```

替换为：

```ts
    let q = supabase.from('effective_punches').select('*')
      .eq('employee_id', profile.id)
      .is('superseded_at', null);
```

- [ ] **Step 2：`EmployeeHome.tsx` 查询加过滤**

把 `src/employee/EmployeeHome.tsx` 里这一段：

```ts
    const { data } = await supabase
      .from('effective_punches')
      .select('*')
      .eq('employee_id', profile.id)
      .gte('effective_time', start)
      .lt('effective_time', end)
      .order('effective_time', { ascending: true });
```

替换为：

```ts
    const { data } = await supabase
      .from('effective_punches')
      .select('*')
      .eq('employee_id', profile.id)
      .is('superseded_at', null)
      .gte('effective_time', start)
      .lt('effective_time', end)
      .order('effective_time', { ascending: true });
```

- [ ] **Step 3：`export-month/index.ts` 查询加过滤**

把 `supabase/functions/export-month/index.ts` 里这一段：

```ts
    let query = admin
      .from('effective_punches')
      .select('employee_id, kind, effective_time, employees(email, full_name)')
      .gte('effective_time', start.toISOString())
      .lt('effective_time', end.toISOString())
      .order('effective_time', { ascending: true });
```

替换为：

```ts
    let query = admin
      .from('effective_punches')
      .select('employee_id, kind, effective_time, employees(email, full_name)')
      .is('superseded_at', null)
      .gte('effective_time', start.toISOString())
      .lt('effective_time', end.toISOString())
      .order('effective_time', { ascending: true });
```

- [ ] **Step 4：构建验证**

Run: `npm run build`
Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add src/employee/EmployeeHistory.tsx src/employee/EmployeeHome.tsx supabase/functions/export-month/index.ts
git commit -m "$(cat <<'EOF'
fix: exclude superseded effective_punches from all reports

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8：部署与手动验证

**Files:** 无（部署 + 冒烟）

- [ ] **Step 1：推送迁移到云端**

Run: `supabase db push`
Expected: `20260518000002_admin_corrections.sql` 被应用，无报错。

- [ ] **Step 2：部署 Edge Function**

Run: `supabase functions deploy admin-correct-punch`
Expected: `Deployed Function admin-correct-punch`。

- [ ] **Step 3：前端构建**

Run: `npm run build`
Expected: PASS。（部署前端按平时的 Vercel 流程；本地验证用 `npm run dev`。）

- [ ] **Step 4：浏览器冒烟测试**

用管理员账号登录，在真实浏览器里逐项确认（CLAUDE.md：CORS preflight 问题只有真实浏览器能暴露）：

1. 看板某行点「修改」→ 改时间 + 填原因 → 保存 → 该行时间变为新值，旁边出现 ✎ 徽标，无重复行。
2. 看板某行点「删除」→ 填原因 → 确认删除 → 该行消失。
3. 点「补登打卡」→ 选员工 + 类型 + 时间 + 原因 → 保存 → 新行出现在看板。
4. 原因留空时无法提交（三种模式）。
5. 切到「导出」下载 CSV，确认被删除/被修改前的旧时间不出现在明细里。
6. 用员工账号登录，「我的历史」与首页今日列表不显示已被取代的打卡。

- [ ] **Step 5：（如有改动）提交**

本任务通常无文件改动；若冒烟中发现并修了问题，按对应文件提交。

---

## 自检（已完成）

- **Spec 覆盖：** 数据模型(Task 1)、RPC(Task 1)、Edge Function(Task 2)、报表排除已取代(Task 1 视图 + Task 7 查询)、前端 UI(Task 5/6)、类型/API/i18n(Task 3/4)、测试(Task 2)——spec 各节均有对应任务。
- **占位符：** 无 TBD / 「适当处理」类措辞，每步均含完整代码或确切命令。
- **类型一致：** `admin_correct_punch` 的 RPC 参数名（`p_admin_id` 等）在 Task 1 与 Task 2 一致；`CorrectionTarget` 字段（`effective_id`/`employee_name`/`kind`/`effective_time`）在 Task 5 定义、Task 6 使用一致；`adminCorrectPunch` 参数形状在 Task 3 定义、Task 5 调用一致；错误码（`ALREADY_CHANGED`/`NOT_FOUND`/`BAD_*`）在 Edge Function、i18n、测试三处一致。
