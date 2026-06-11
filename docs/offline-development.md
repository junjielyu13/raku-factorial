# 离线开发指南（本地 Supabase 栈）

本项目的"本地后端"不是一个手写的 `docker-compose.yml`，而是由 **Supabase CLI** 管理的一整套
Docker 容器（Postgres / Auth / REST / Realtime / Storage / Studio / Edge Runtime / Kong 等，共 ~12 个）。
栈的定义来源是 `supabase/config.toml`，CLI 会据此自动拉起所有容器，并打上
`com.supabase.cli.project=raku-factorial` 的 label 统一管理。

> ⚠️ **不要手写 docker-compose 来跑这套东西。** CLI 已经在做这件事，手写的版本会和官方栈漂移、迟早失效。
> 需要本地后端时，只用下面的 `supabase start` / `supabase stop`。

平时我们直接在 **Supabase 线上项目**（`--project-ref gdacfthuunkcilcwwopb`）开发，本地栈是停掉的。
本文档用于**下次需要离线 / 断网开发**时把它重新拉起来。

---

## 前置条件

- **Docker Desktop 必须在运行**（本地栈跑在 Docker 里）。
- Supabase CLI 已安装：`supabase --version`（写本文时为 v2.98.2）。
  - 升级（可选）：`brew upgrade supabase`
- 在项目根目录 `/Users/jli/my-project/raku-factorial` 下执行命令。

---

## 启动离线栈

```bash
# 1. 确认 Docker Desktop 已启动
open -a Docker            # 如果还没开

# 2. 拉起整套本地 Supabase 栈
supabase start
```

首次启动会拉镜像，需要几分钟。完成后会打印所有本地 URL 和 key。随时可以再查：

```bash
supabase status -o json   # 所有 URL 和 key（JSON）
```

关键本地地址：

| 服务            | 地址                                      |
| --------------- | ----------------------------------------- |
| API (Kong)      | http://127.0.0.1:54321                    |
| Postgres        | 127.0.0.1:54322（用户 `postgres`）        |
| Studio（控制台）| http://127.0.0.1:54323                    |
| Inbucket（邮件）| http://127.0.0.1:54324                    |

### 让前端指向本地

`.env.local` 里的 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 平时指向线上。离线开发时改成
`supabase status` 输出的本地 `API URL` 和 anon/publishable key（**改完记得跑完离线后再切回线上**）。

```bash
npm run dev               # vite dev server，端口 5173
```

---

## 数据：备份与重置

上次停栈用的是 `supabase stop`（**保留备份**），所以本地 Postgres 数据还在一个 Docker 卷里：

```bash
docker volume ls --filter label=com.supabase.cli.project=raku-factorial
```

- **`supabase start`** 会自动从这个卷恢复你上次的本地数据。
- 想要干净重建（重新跑 `migrations/` + `seed.sql`）：

```bash
supabase db reset
```

---

## 停止离线栈（用完之后）

```bash
# 推荐：停掉所有容器，但保留 DB 数据卷作为备份
supabase stop

# 或者：彻底清空，连数据卷一起删（下次 start 会从 migrations + seed 重建）
supabase stop --no-backup
```

> 这两条都**只影响本地**。线上 Supabase 项目完全不受影响。

---

## 排错

- **`supabase start` 卡住 / 报连不上 Docker** → Docker Desktop 没开，或没开完。`open -a Docker` 等它就绪。
- **端口被占**（54321–54327）→ 之前的栈没干净停掉。`supabase stop` 再 `supabase start`；
  实在不行 `docker ps -a | grep raku-factorial` 看看残留。
- **想看本地收到的邮件**（注册/重置密码等）→ Inbucket http://127.0.0.1:54324 。
- **本地和线上 schema 不一致** → 本地 `supabase db reset` 重新应用 `migrations/`；
  线上用 `supabase db push`。
