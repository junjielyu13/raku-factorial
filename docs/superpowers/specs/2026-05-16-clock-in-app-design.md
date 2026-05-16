# 员工打卡 Web 应用 — 设计文档

- **日期**：2026-05-16
- **状态**：设计已确认，待制定实施计划
- **责任人**：jli@altech.es

## 1. 背景

西班牙一家小公司，5 名员工，需要一个 Web 打卡应用，满足《Real Decreto-ley 8/2019》对劳动工时记录的要求：每日工时记录、4 年保存、可供劳动稽查员审查并导出。

## 2. 目标

- 5 名员工的合规工时记录
- 员工使用各自的手机或电脑打卡
- GPS 围栏校验，确保打卡发生在办公地点
- 不可篡改的原始记录与审计追溯
- 员工发起补卡/改时间申请，管理员审批
- 按月 CSV 报表导出（供稽查/薪资）

### 非目标（v1 不做）

- 多租户 SaaS
- 原生移动 App
- 排班、休息时间管理、工资计算
- 办公地点之外的打卡（不支持外勤）
- 邮件/推送通知
- PDF 报表（CSV 先行；PDF 列入未来工作）

## 3. 约束

- 全部使用免费层，不绑信用卡
- 无服务器 / 静态托管
- 历史数据保留 4 年

## 4. 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│   员工浏览器（手机/电脑）       管理员浏览器                  │
│   ┌──────────────┐             ┌──────────────────┐         │
│   │ 打卡按钮      │             │ 实时看板         │         │
│   │ 我的历史      │             │ 审批补卡请求      │         │
│   │ 提交补卡      │             │ 导出月报         │         │
│   └──────┬───────┘             └────────┬─────────┘         │
└──────────┼──────────────────────────────┼───────────────────┘
           │ HTTPS                        │
           ▼                              ▼
   ┌────────────────────── Vercel ──────────────────────┐
   │   React (Vite) SPA · 静态文件 · 全球 CDN            │
   └────────────────────────┬───────────────────────────┘
                            │ Supabase JS SDK
                            ▼
   ┌──────────────────── Supabase ──────────────────────┐
   │  Auth (Magic Link)                                  │
   │  PostgreSQL  ←── RLS 行级安全 ───┐                  │
   │   ├ employees                   │                  │
   │   ├ punches  (不可改/删)        │                  │
   │   ├ punch_edit_requests         │                  │
   │   ├ effective_punches           │                  │
   │   └ office_locations            │                  │
   │  Edge Functions (Deno)          │                  │
   │   ├ punch-in   ← 服务端 GPS 校验+时间戳             │
   │   ├ submit-edit-request         │                  │
   │   ├ approve-edit / reject-edit  │                  │
   │   └ export-month (CSV)          │                  │
   │  Realtime (订阅 punches 变化)   │                  │
   └─────────────────────────────────┴──────────────────┘
```

**技术栈**

| 层 | 选择 |
|---|---|
| 前端 | React + Vite + TypeScript |
| 部署 | Vercel（Git 触发） |
| 数据库 | Supabase Postgres（500 MB 免费层） |
| 认证 | Supabase Auth + Magic Link（员工与管理员同入口，按 `employees.role` 路由到不同界面） |
| 服务端逻辑 | Supabase Edge Functions（Deno） |
| 实时推送 | Supabase Realtime |

**安全边界**：所有写入都经过 Edge Function（使用 service role key）。浏览器**永远不能直接** INSERT 到 `punches` 表。这让 GPS 校验、服务端时间戳、顺序校验都无法被绕过。

## 5. 数据模型

```sql
-- 员工（扩展 auth.users）
employees (
  id              uuid PRIMARY KEY REFERENCES auth.users(id),
  email           text UNIQUE NOT NULL,
  full_name       text NOT NULL,
  role            text NOT NULL CHECK (role IN ('employee', 'admin')),
  active          bool NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
)

-- 办公地点（GPS 围栏中心 + 半径）
office_locations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  latitude        numeric(9,6) NOT NULL,
  longitude       numeric(9,6) NOT NULL,
  radius_meters   integer NOT NULL DEFAULT 200,
  active          bool NOT NULL DEFAULT true
)

-- 原始打卡记录（INSERT-only）
punches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES employees(id),
  kind            text NOT NULL CHECK (kind IN ('in', 'out')),
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  latitude        numeric(9,6) NOT NULL,
  longitude       numeric(9,6) NOT NULL,
  accuracy_m      numeric,
  office_id       uuid NOT NULL REFERENCES office_locations(id),
  user_agent      text,
  ip_address      inet
)

-- 补卡/改时间申请
punch_edit_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id        uuid NOT NULL REFERENCES employees(id),
  original_punch_id  uuid REFERENCES punches(id),
  requested_kind     text NOT NULL CHECK (requested_kind IN ('in', 'out')),
  requested_time     timestamptz NOT NULL,
  reason             text NOT NULL,
  status             text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by        uuid REFERENCES employees(id),
  reviewed_at        timestamptz,
  review_note        text,
  created_at         timestamptz NOT NULL DEFAULT now()
)

-- 工时计算与月报基于此表
effective_punches (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id        uuid NOT NULL REFERENCES employees(id),
  kind               text NOT NULL CHECK (kind IN ('in', 'out')),
  effective_time     timestamptz NOT NULL,
  source_punch_id    uuid REFERENCES punches(id),
  source_request_id  uuid REFERENCES punch_edit_requests(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (source_punch_id IS NOT NULL AND source_request_id IS NULL) OR
    (source_punch_id IS NULL AND source_request_id IS NOT NULL)
  )
)
```

**三层时间真相**

- `punches.recorded_at` — 员工实际按按钮的时刻，永不修改
- `effective_punches.effective_time` — 用于工时计算和报表的时间，可能等于 recorded_at，或来自审批通过的申请
- 审计员任何时候都能看到这两层

**RLS 策略汇总**

| 表 | 员工 | 管理员 | service_role (Edge Func) |
|---|---|---|---|
| `punches` | SELECT 自己的 | SELECT 全部 | INSERT |
| `effective_punches` | SELECT 自己的 | SELECT 全部 | INSERT |
| `punch_edit_requests` | SELECT/INSERT 自己的 | SELECT 全部 | INSERT/UPDATE（由 approve-edit/reject-edit 写入审批结果）|
| `office_locations` | SELECT active 行 | ALL | — |
| `employees` | SELECT 全部（看姓名） | ALL | — |

所有表对前端用户都不开放 UPDATE/DELETE。审批通过的状态改动也由 Edge Function 用 service role 写入，确保所有改动有统一的服务端路径。

## 6. Edge Functions 与数据流

### 打卡流程

```
[员工浏览器]                    [Vercel/SPA]              [Supabase Edge Function]   [Postgres]
    │ 点击"上班打卡"                  │                            │                      │
    │───────────────────────────────▶│                            │                      │
    │                                │ navigator.geolocation       │                      │
    │  ◀── (浏览器弹出授权) ────────  │                            │                      │
    │ 返回 {lat, lng, accuracy}       │                            │                      │
    │───────────────────────────────▶│ POST /punch-in              │                      │
    │                                │ {kind, lat, lng, acc} + JWT │                      │
    │                                │───────────────────────────▶│                      │
    │                                │                            │ 验证 JWT             │
    │                                │                            │ 查 office_locations  │
    │                                │                            │ Haversine 距离       │
    │                                │                            │ accuracy 校验         │
    │                                │                            │ 防重复(<60s)          │
    │                                │                            │ 顺序校验              │
    │                                │                            │ BEGIN                 │
    │                                │                            │   INSERT punches     │
    │                                │                            │   INSERT effective   │
    │                                │                            │ COMMIT                │
    │                                │ ◀────── 200 + punch ───────│                      │
    │ ◀──── "✓ 已打卡 09:03" ──────── │                            │                      │
```

### Edge Functions 清单

| 名称 | 作用 | 关键校验 |
|---|---|---|
| `punch-in` | 创建打卡 | JWT 有效 / 围栏内 / accuracy ≤ 100m / 与上一次 ≥ 60s / kind 顺序合理 |
| `submit-edit-request` | 提交补卡或改时间 | 时间不能在未来 / reason 非空 |
| `approve-edit` | 管理员审批通过 | 调用者 role='admin' / status='pending' / 通过则写 effective_punches |
| `reject-edit` | 管理员拒绝 | 同上但不写 effective_punches |
| `export-month` | 生成 CSV 月报 | role='admin' 或申请人本人 |

### Haversine 距离校验

```ts
const R = 6371000; // 地球半径，米
const toRad = (d: number) => d * Math.PI / 180;
const dLat = toRad(lat - office.latitude);
const dLng = toRad(lng - office.longitude);
const a = Math.sin(dLat / 2) ** 2 +
          Math.cos(toRad(office.latitude)) * Math.cos(toRad(lat)) *
          Math.sin(dLng / 2) ** 2;
const distance = 2 * R * Math.asin(Math.sqrt(a));
if (distance > office.radius_meters) throw new Error('OUT_OF_GEOFENCE');
```

### 月度工时聚合视图

```sql
CREATE VIEW monthly_hours AS
SELECT
  employee_id,
  date_trunc('month', effective_time) AS month,
  sum(
    CASE WHEN kind='out' THEN effective_time - LAG(effective_time) OVER w
         ELSE interval '0' END
  ) AS worked
FROM effective_punches
WINDOW w AS (PARTITION BY employee_id, date_trunc('day', effective_time)
             ORDER BY effective_time)
GROUP BY employee_id, date_trunc('month', effective_time);
```

### 实时管理视图

```ts
supabase.channel('punches')
  .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'effective_punches' },
      payload => refreshTodayList())
  .subscribe()
```

## 7. 错误处理与边界场景

### 用户可见错误

| 场景 | 错误码 | 前端文案 |
|---|---|---|
| 浏览器拒绝授权 GPS | 未发请求 | 需要位置权限才能打卡。请在浏览器设置里允许后重试。 |
| 距离 > radius | `OUT_OF_GEOFENCE` | 你距离办公地 850m，不在打卡范围内。 |
| accuracy > 100m | `LOW_ACCURACY` | 定位精度不足（±150m）。请到窗边或室外重试。 |
| 60 秒内重复 | `TOO_SOON` | 刚打过卡了，请稍后再试。 |
| 顺序错误（in/in 或 out/out） | `INVALID_SEQUENCE` | 你今天还没下班打卡，不能再打上班。如有问题请提交补卡申请。 |
| 网络断 | fetch fail | 网络不通。打卡未成功，请重试。 |
| JWT 过期 | 401 | 前端拦截，跳登录页 |

### 系统边界场景

1. **跨天班次**：`effective_punches` 不按自然日约束，配对算法用"in 之后第一个 out"。23:50 in / 08:00 out 自动算 8h10m。
2. **离线打卡**：不做。员工无网时打不上，事后提补卡申请。
3. **室内 GPS 飘**：等几秒重试，或走窗边。彻底打不上的办公室可以扩大 radius 或注册多个 office_locations。
4. **审批积压**：补卡请求不阻塞日常打卡。月报导出时如果有 pending 请求，文档底部列"待审批"清单。
5. **员工离职**：`employees.active = false`，禁止登录，但历史保留 4 年，报表仍能查。
6. **办公地点变更**：旧地点 `active=false`，建新行。`punches.office_id` 指向打卡时那条 → 历史完整保留。
7. **时区**：所有 `timestamptz` 存 UTC，前端按 `Europe/Madrid` 显示。CSV 导出也按 `Europe/Madrid` 渲染。

### 原子性

`punch-in` 同时写 `punches` + `effective_punches`，必须在单个 PL/pgSQL 事务（封装为 RPC，Edge Function 调用），避免"半写入"。

## 8. 测试策略

### Edge Functions 单元测试（必须）

`supabase/functions/punch-in/test.ts`：
- 围栏内 + 高精度 → 写入两张表
- 围栏外 → `OUT_OF_GEOFENCE`，不写表
- 精度 > 100m → `LOW_ACCURACY`
- 60s 内重复 → `TOO_SOON`
- 连续两次 in → `INVALID_SEQUENCE`
- JWT 无效 → 401
- Haversine 边界值（恰好 200m / 201m）

`supabase/functions/approve-edit/test.ts`：
- 非 admin 调用 → 403
- 通过 → effective_punches 增加一行，原 punches 不动
- 重复审批同一请求 → 拒绝

测试用本地 Supabase（`supabase start`）跑真实 Postgres，不 mock。

### RLS 策略测试（必须）

用 SQL/pgTAP 断言权限边界：
- 员工 A 不能 SELECT 员工 B 的 punches
- 员工不能直接 INSERT 到 punches
- 管理员能 SELECT 所有
- 非 admin 不能 UPDATE punch_edit_requests.status

**RLS 漏洞是本项目最大的合规风险**，必须覆盖。

### 前端 E2E（轻量）

Playwright 跑 2 条核心路径：
- `e2e/employee-punch-in.spec.ts`：Magic link 登录 → mock GPS 在围栏内 → 点打卡 → 成功状态
- `e2e/admin-approve-edit.spec.ts`：员工提交补卡 → 管理员审批通过 → effective_punches 出现

### 不测的东西（YAGNI）

- React 组件单元测试
- 月度聚合 SQL（手动验证一次）
- 浏览器兼容性矩阵（人工跑一遍）

### CI

GitHub Actions：每次 push 跑 Edge Function + RLS 测试。E2E 在 PR 合并前跑。Vercel 自动部署预览，部署后人工 smoke test。

## 9. 决策记录

- GPS 精度阈值：100m（与 200m 围栏配合）
- 重复打卡时间窗：60s
- 月度导出 v1：CSV；PDF 列入未来工作
- 不做离线打卡 — 失败的打卡走补卡申请
- 跨午夜班次：自动配对 in→下一个 out
- 时间戳：UTC 存储，`Europe/Madrid` 显示
- 坐标类型：`numeric(9,6)`（不引入 PostGIS）
- 所有写入经 Edge Function，浏览器无直接 INSERT 权限

## 10. 未来工作（v2+）

- PDF 月报（jsPDF 或 Edge Function 调用 puppeteer 服务）
- 管理员补卡审批的邮件提醒
- 异常检测（忘记下班打卡、连续未打卡）
- 多办公地点的 UI 切换（数据模型已支持，UI v1 假设单地点）
- 工作时长仪表板（管理员看每月汇总图表）
