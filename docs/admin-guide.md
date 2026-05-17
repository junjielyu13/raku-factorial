# 管理员操作手册

打卡应用的日常管理任务速查。所有操作在 Supabase Dashboard 完成，链接已嵌入。

**项目入口**：https://supabase.com/dashboard/project/gdacfthuunkcilcwwopb
**应用地址**：https://raku-factorial.vercel.app

---

## 添加新员工

### 1. 在 Supabase 建 Auth 用户

打开 [Authentication → Users](https://supabase.com/dashboard/project/gdacfthuunkcilcwwopb/auth/users)

- 右上 **Add user** → **Create new user**
- **Email**：员工邮箱
- **Password**：你帮他设一个临时密码（建议 12 位以上随机字符）
- ☑ **Auto Confirm User**（必须勾上，否则会卡在邮箱验证）
- 点 **Create user**

### 2. 复制 User UID

在用户列表里点开刚建的用户，看到 `User UID`，复制下来（形如 `12345678-abcd-...`）

### 3. 把员工加进 employees 表

打开 [SQL Editor](https://supabase.com/dashboard/project/gdacfthuunkcilcwwopb/sql/new)，粘贴并运行：

```sql
INSERT INTO public.employees (id, email, full_name, role)
VALUES ('<把 User UID 粘在这里>', '员工邮箱', '员工真实姓名', 'employee');
```

> 把 `'employee'` 改成 `'admin'` 就是新增一名管理员。

看到 "Success. No rows returned" 即完成。

### 4. 通知员工

把这三样发给员工（建议用一次性消息或要求他登录后立即改密码）：

- 应用地址：`https://raku-factorial.vercel.app`
- 邮箱（步骤 1 填的那个）
- 临时密码

员工首次登录后，**让他自己去找你改密码**（目前 UI 没有"修改密码"页面，需要管理员在 Studio 里改）。

---

## 修改员工密码

### 方式 A：Supabase Studio（推荐）

1. 打开 [Authentication → Users](https://supabase.com/dashboard/project/gdacfthuunkcilcwwopb/auth/users)
2. 找到该员工，点右侧的 `⋯` → **Send password recovery**（如果配了邮件）

或者直接重置：

1. 点该用户进入详情页
2. 顶部有 **Reset password** 选项 → 设新密码

### 方式 B：SQL（如果方式 A 不可用）

```sql
-- 不推荐 —— Auth 表是 Supabase 内部管理的，直接改密码哈希容易踩坑。
-- 优先用方式 A。
```

---

## 停用员工（离职）

**不要删除** —— 历史打卡记录还要保存 4 年。改成停用即可：

```sql
UPDATE public.employees
SET active = false
WHERE email = '离职员工邮箱';
```

效果：

- 员工无法登录（Edge Function 检查到 `active=false` 会返回 403 `INACTIVE`）
- 历史打卡记录保留
- 管理员报表里仍能查到他

如果以后要恢复，把 `active = true` 即可。

---

## 修改办公地点 / GPS 围栏

[SQL Editor](https://supabase.com/dashboard/project/gdacfthuunkcilcwwopb/sql/new) 跑：

```sql
-- 改坐标和半径
UPDATE public.office_locations
SET latitude = 41.478107,
    longitude = 2.084087,
    radius_meters = 200
WHERE id = '00000000-0000-0000-0000-000000000001';
```

- 经纬度从 Google Maps 右键 → "What's here?" 拿
- `radius_meters` 越小越严格。建议 100-300。室内 GPS 飘的话可以放大一点

要新增第二个办公地点（员工分布在多地）：

```sql
INSERT INTO public.office_locations (name, latitude, longitude, radius_meters)
VALUES ('分部', 41.xxx, 2.xxx, 200);
```

打卡时系统会检查**任意一个 active 的办公点**，符合即通过。

---

## 处理补卡申请

员工在 app 里 → 补卡申请 → 提交后会出现在你的审批页面：

`https://raku-factorial.vercel.app/admin/approvals`

点 **通过** 或 **拒绝**。

- **通过**：会在 `effective_punches` 表生成新的"有效打卡"记录，但**原始 punches 表完全不动**（合规追溯需要）
- **拒绝**：状态改为 rejected，不生成任何打卡记录

---

## 导出月度报表

`https://raku-factorial.vercel.app/admin/export`

选月份 → 下载 CSV。CSV 包含每条打卡记录 + 每个员工的月度总工时。

合规存档建议每月初导出一次上个月的，保存 4 年（劳动法要求）。

---

## 紧急停机

如果出现重大问题需要紧急停服：

1. **暂停所有 Edge Functions**：
   [Edge Functions Dashboard](https://supabase.com/dashboard/project/gdacfthuunkcilcwwopb/functions) → 每个函数 → Settings → Disable

2. **或者直接禁用前端**：Vercel Dashboard → 该项目 → Settings → 临时把 production 部署改成"Disabled"

恢复反向操作即可。
