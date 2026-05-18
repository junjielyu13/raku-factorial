# 管理员代补卡 / 打卡修正 — 设计文档

**日期：** 2026-05-18
**状态：** 已批准，待编写实现计划

## 问题

管理员需要修正员工的上/下班打卡记录：改错误的时间、补员工漏打的卡、作废误打的重复卡。
目前应用没有任何途径做这件事。

现有的 edit-request 流程只能**补登**漏打的卡 —— `SubmitEditRequest.tsx` 从不设置
`original_punch_id`，`approve_edit_request` 永远只是**插入**一条新的 `effective_punches`
记录，不会取代任何已有记录。所以现在没有任何机制可以修改或删除一条已记录的有效打卡。

## 法规约束（RD-ley 8/2019 / ITSS Criterio Técnico 101/2019）

西班牙劳工法要求工时记录可靠、真实、可追溯。允许修正，但必须有完整审计轨迹：谁改的、
改了什么、何时改、原值、新值、原因。直接覆盖 `punches` 是被禁止的。

本设计满足该要求：`punches`（不可变的原始记录）与 `punch_edit_requests`（修正日志）
共同构成审计轨迹。`effective_punches` 是供看板和报表使用的派生「当前真相」层 ——
在该层取代一条记录，永远不会销毁底层的审计记录。

## 范围

三种管理员操作，全部从管理员看板进入：

1. **修改** —— 改一条已有有效打卡的时间/类型。
2. **补登** —— 录入一条员工从未打过的卡。
3. **删除** —— 作废一条误打卡（例如手滑打了两次）。

每个操作都会被记录并自动批准（管理员本身就是合法的审批人）。

**非目标：** 不改动员工端（员工仍只能通过现有流程补登漏打的卡）；手动修正不做地理围栏/
GPS；不做批量编辑。

## 架构决策

**所选方案：** 把 `punch_edit_requests` 扩展为统一的审计日志，并给 `effective_punches`
加一个软删除标记。

被否决的备选方案：
- 新建独立的 `punch_corrections` 表 —— 会产生两份审计日志，审批和 CSV 导出都得合并它们。
- 让 `effective_punches` 直接可改 + 一个通用 JSON `audit_log` —— 审计轨迹变成松散 JSON，
  难以查询，且偏离现有模式。

所选方案保留单一审计日志，符合 CLAUDE.md 的不变量「修正一律走 `punch_edit_requests`」，
而且完全是加法式改动 —— 既有数据和既有员工流程都不受影响。

## 1. 数据模型 —— 迁移 `20260518000002_admin_corrections.sql`

### `punch_edit_requests` —— 新增三列

| 列 | 类型 | 说明 |
|---|---|---|
| `created_by` | `uuid REFERENCES employees(id)` | 发起人。`NULL` = 员工本人（保留现有流程语义）。 |
| `action` | `text NOT NULL DEFAULT 'add' CHECK (action IN ('add','modify','delete'))` | 操作类型。 |
| `target_effective_id` | `uuid REFERENCES effective_punches(id)` | `modify`/`delete` 取代的是哪条有效记录。`add` 时为 `NULL`。 |

### `effective_punches` —— 软删除二元组

| 列 | 类型 | 说明 |
|---|---|---|
| `superseded_at` | `timestamptz` | `NULL` = 有效。非空 = 不再计入。 |
| `superseded_by_request_id` | `uuid REFERENCES punch_edit_requests(id)` | 取代本行的那条修正记录。 |

既有的 `(source_punch_id IS NOT NULL) XOR (source_request_id IS NOT NULL)` CHECK
约束不变：`add`/`modify` 产生 request-sourced 的有效记录；`delete` 不产生任何记录。

## 2. RPC —— `admin_correct_punch(...)`

`SECURITY DEFINER`，`SET search_path = public`。从 `PUBLIC`/`anon`/`authenticated`
`REVOKE`，`GRANT` 给 `service_role` —— 与其他 RPC 同一套模式。

```
admin_correct_punch(
  p_admin_id            uuid,
  p_action              text,         -- 'add' | 'modify' | 'delete'
  p_target_effective_id uuid,         -- modify/delete 必填，add 时为 NULL
  p_employee_id         uuid,         -- add 必填；modify/delete 时从目标行推导
  p_kind                text,         -- add/modify 必填
  p_time                timestamptz,  -- add/modify 必填
  p_reason              text
) RETURNS void
```

单个原子事务，按 `p_action` 分派：

- **add** —— 插入一条 `punch_edit_requests`（`action='add'`、`status='approved'`、
  `created_by` = `reviewed_by` = `p_admin_id`、`reviewed_at = now()`）；再插入一条
  source 为该请求的新 `effective_punches` 记录。

- **modify** —— 对目标有效记录 `SELECT ... FOR UPDATE`；从中推导 `employee_id`；
  插入一条请求（`action='modify'`、`original_punch_id` = 目标的 `source_punch_id`、
  `target_effective_id` = 目标）；插入 source 为该请求的新 `effective_punches` 记录；
  把目标行的 `superseded_at = now()` 与 `superseded_by_request_id` 置上。

- **delete** —— 对目标 `SELECT ... FOR UPDATE`；插入一条请求（`action='delete'`，
  把被作废打卡的 `requested_kind`/`requested_time` 记下来，让审计能看到*删了什么*）；
  把目标置为已取代；不产生新的有效记录。

守卫：
- 目标不存在 → `RAISE EXCEPTION USING ERRCODE = 'P0002'`（→ 404）。
- 目标已被取代 → `RAISE EXCEPTION USING ERRCODE = 'P0001'`（→ 409）。

## 3. Edge Function —— `admin-correct-punch`

`POST`。`handleCors` → `authenticate` → `requireAdmin`。校验：`action` 在枚举内；
`reason` 非空；`add`/`modify` 时 `p_time` 可解析且不在未来；按操作类型校验必填字段。
通过 `adminClient()` 调用 RPC。错误映射 `P0001` → 409 `ALREADY_CHANGED`、
`P0002` → 404 `NOT_FOUND`。结构与 `approve-edit/index.ts` 一致。仅管理员的限制在
服务端强制，不只靠隐藏 UI。

## 4. 报表中排除已取代的记录

每个 `effective_punches` 的消费方都必须过滤 `superseded_at IS NULL`：

| 消费方 | 改动 |
|---|---|
| `src/admin/AdminDashboard.tsx` 查询 | 加 `.is('superseded_at', null)` |
| `src/employee/EmployeeHistory.tsx` 查询 | 加 `.is('superseded_at', null)` |
| `src/employee/EmployeeHome.tsx` 查询 | 加 `.is('superseded_at', null)` |
| `supabase/functions/export-month/index.ts` 查询 | 加 `.is('superseded_at', null)` |
| `daily_worked` 视图 | 替换为带 `WHERE superseded_at IS NULL`，保留 `security_invoker = on` |

`monthly_hours` 和 CSV 合计都派生自 `daily_worked`，因此被间接覆盖。

## 5. 前端 UI —— `AdminDashboard`

- 每条打卡行新增小号 **✎ 修改** 与 **🗑 删除** 操作（新增一列）。
- 在日期/员工筛选附近放一个页面级 **补登打卡** 按钮，用于没有对应行的打卡。
- 一个 `src/components/PunchCorrectionModal.tsx`，三种模式：
  - `add` / `modify` 共用一个表单：类型切换、`datetime-local` 输入、原因文本框。
  - `delete` 以只读方式展示该打卡，外加一个必填的原因字段。
  - 三种模式下原因都为必填（审计要求）。
- source 为请求（`source_request_id` 非空）的行展示一个不显眼的「✎ 已修正」徽标 ——
  作为修正轨迹的可见证据。
- 任意操作后重新拉取打卡列表。现有的实时频道只监听 `INSERT`；`modify`/`delete` 还会
  `UPDATE`，所以无论如何都需要手动重新拉取。

## 6. 配套改动

- `src/lib/types.ts` —— 扩展 `EffectivePunch`（`superseded_at`、
  `superseded_by_request_id`）和 `PunchEditRequest`（`created_by`、`action`、
  `target_effective_id`）。
- `src/lib/api.ts` —— 新增 `adminCorrectPunch(args)` 封装。
- `src/i18n/messages.ts` —— 新增 `admin.correct.*` 字符串和错误码，按 i18n 约定
  添加到全部三种语言（`zh`、`en`、`es`）。

## 7. 测试

`supabase/functions/admin-correct-punch/test.ts`（Deno），沿用现有
`approve-edit/test.ts` 的模式：
- `add` 正常路径 → 200，新增一条 `effective_punches` 记录，请求 `action='add'`。
- `modify` 正常路径 → 200，新增一条有效记录，旧行 `superseded_at` 被置上。
- `delete` 正常路径 → 200，目标被取代，不新增有效记录。
- 非管理员调用 → 403。
- 对已被取代的行做 modify/delete → 409。

## CLAUDE.md 不变量 —— 合规核对

1. `punches` 仅追加/不可变 —— 未触碰。✅
2. 打卡插入走 `create_punch` —— 不受影响；本功能只插入 `effective_punches` 与
   `punch_edit_requests`。✅
3. 修正一律走 `punch_edit_requests` —— 每个操作都写入一条。✅
4. 视图使用 `security_invoker = on` —— 替换 `daily_worked` 时保留。✅
5. GPS 记录但不强制 —— 手动修正没有 GPS；属预期。✅
