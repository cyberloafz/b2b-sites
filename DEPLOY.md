# 上线部署指南（阶段 5）

这份指南写给负责上线的人（你自己，或你请的工程师）。平台代码已经准备好，下面是要在各个云服务上开通、设置的东西。

## 最快上线：Vercel + Neon + Vercel Blob（约 15 分钟，不用写代码）

这是第一次上线最省事的组合。图片先存在 Vercel Blob，以后量大了再换 R2。

1. 代码放到 GitHub 的一个私有仓库。
2. 在 vercel.com 点 **Add New → Project**，选这个仓库，框架会自动识别为 Next.js。先不用填任何环境变量，直接点 **Deploy**。
   - 第一次部署会失败或打不开，因为还没有数据库，这是正常的。
3. 进入项目的 **Storage** 页，添加两样东西：
   - **Create Database → Neon (Postgres)**：区域选 US East (Washington, D.C.)，连接到本项目。系统会自动设置 `DATABASE_URL`。
   - **Create → Blob**：连接到本项目。系统会自动设置 `BLOB_READ_WRITE_TOKEN`，平台检测到它就把图片存进 Blob。
4. 在 **Settings → Environment Variables** 添加：
   - `SETUP_CODE`：随便一串只有你知道的字符，防止别人抢先注册管理员；
   - `CRON_SECRET`：一串随机字符。
5. 在 **Deployments** 里对最新一次部署点 **Redeploy**。
6. 打开 `https://你的项目名.vercel.app`，会自动进入"Set up your platform"页面：
   - 输入 `SETUP_CODE`，创建第一个账号，它就是平台管理员；
   - 之后进入 `/platform` 管理后台，或点 "New site with AI" 生成网站。
7. 打开 `https://你的项目名.vercel.app/api/health` 检查：应显示 `"database":"postgres"`、`"storage":"blob"`。

这时还缺的（可以以后再加）：
- **AI 写文案**：添加 `ANTHROPIC_API_KEY` 后重新部署。没有它，用的是演示写手。
- **发邮件**（邀请、找回密码、询盘通知）：添加 `RESEND_API_KEY` 和 `EMAIL_FROM`。没有它，邮件只记录、不发送。
- **客户网站公开访问**：每个网站需要一个域名。可以是平台域名下的子域名（买一个平台域名，在 Vercel 添加 `*.你的域名`，再设置 `PLATFORM_DOMAIN`），也可以是客户自己的域名（在后台"Domains"页添加，需设置 `DOMAIN_PROVIDER=vercel` 和 Vercel 令牌，见下文）。没有域名时，客户网站只能在后台预览。
- **定时任务**：免费的 Hobby 套餐每天只能跑一次（`vercel.json` 已设为每天一次）。升级 Pro 后，可以把 `vercel.json` 里的 schedule 改成 `*/5 * * * *`。

## 选一种部署方式

| | 方式 A：Vercel（推荐起步） | 方式 B：一台自己的服务器（Docker） |
| --- | --- | --- |
| 适合 | 不想管服务器；客户数量从 0 到几百 | 想控制成本、客户很多，或要放在固定 IP 上 |
| 网站和后台 | Vercel（Pro 套餐，约 $20/月） | 一台 2 核 4G 的云服务器（约 $20–40/月） |
| 数据库 | Neon 或 Supabase 的 Postgres（美国区，免费起步） | 同一台服务器上的 Postgres（已写在 docker-compose 里） |
| 图片存储 | Vercel Blob（最省事），或 Cloudflare R2（前 10 GB 免费） | Cloudflare R2，或服务器本地磁盘 |
| 客户域名的 HTTPS | Vercel 自动签发（`DOMAIN_PROVIDER=vercel`） | Caddy 自动签发（`DOMAIN_PROVIDER=caddy`） |
| 定时任务 | `vercel.json` 已配置每 5 分钟一次 | docker-compose 里的 cron 容器 |
| 邮件 | Resend（每月 3000 封免费） | 同左 |

两种方式用的是同一套代码，以后可以互相迁移（数据库导出导入即可）。

## 方式 A：Vercel

1. **数据库**：在 Neon（neon.tech）建一个项目，区域选 US East，复制连接串作为 `DATABASE_URL`。首次启动会自动建表。
2. **图片存储（R2）**：
   - Cloudflare 后台 → R2 → 建一个 bucket，比如 `site-media`；
   - bucket 设置里连接一个自定义域名，比如 `media.yourplatform.com`，作为 `STORAGE_PUBLIC_URL`；
   - R2 → Manage API tokens → 建一个 "Object Read & Write" 令牌，把 Access Key ID、Secret 和 S3 endpoint 填进环境变量；
   - 设置 `STORAGE_DRIVER=s3`。
3. **邮件（Resend）**：
   - 在 resend.com 添加发信域名（比如 `yourplatform.com`），按提示在 DNS 加 SPF 和 DKIM 记录，等状态变成 Verified；
   - 建 API key 作为 `RESEND_API_KEY`；
   - `EMAIL_FROM` 设为 `"Website <notifications@yourplatform.com>"`。
   - 询盘通知邮件的"回复"会直接回到访客邮箱。
4. **部署**：
   - 把代码推到 GitHub，在 Vercel 导入；
   - 在 Settings → Environment Variables 填入 `.env.example` 里的各项（见下面的"必填项"）；
   - 部署。
5. **平台域名**：
   - 在 Vercel 项目里添加 `app.yourplatform.com`（后台）和 `*.yourplatform.com`（每个新站的临时地址，泛域名要用 Vercel 的 DNS）；
   - 设置 `ADMIN_HOST=app.yourplatform.com`、`ADMIN_BASE_URL=https://app.yourplatform.com`、`PLATFORM_DOMAIN=yourplatform.com`。
6. **客户域名**：
   - `DOMAIN_PROVIDER=vercel`；
   - `VERCEL_TOKEN` 在 Vercel → Account Settings → Tokens 创建；
   - `VERCEL_PROJECT_ID` 在项目 Settings 里；团队账号还要填 `VERCEL_TEAM_ID`；
   - `PLATFORM_CNAME_TARGET=cname.vercel-dns.com`，`PLATFORM_A_RECORDS=76.76.21.21`。
7. **定时任务**：`vercel.json` 已配置每 5 分钟调用一次 `/api/cron/deliver`，Vercel 会自动带上 `CRON_SECRET`。每 5 分钟一次需要 Pro 套餐。

## 方式 B：一台服务器（Docker + Caddy）

1. 买一台美国区的 Linux 服务器，装好 Docker。
2. DNS：
   - `app.yourplatform.com` 和 `*.yourplatform.com` 都用 A 记录指向服务器 IP；
   - `sites.yourplatform.com` 也指向这个 IP，作为客户 CNAME 的目标。
3. 把代码传到服务器，然后：
   ```bash
   cd deploy
   cp ../.env.example .env        # 填好各项，另加 POSTGRES_PASSWORD 和 ADMIN_HOST
   docker compose up -d --build
   docker compose exec app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>r.text()).then(console.log)"
   ```
4. 在 `.env` 里设置：`PLATFORM_CNAME_TARGET=sites.yourplatform.com`，`PLATFORM_A_RECORDS=<服务器 IP>`。
   - Caddy 会在客户域名第一次被访问时自动申请 HTTPS 证书；
   - 申请前 Caddy 会先问平台"这个域名验证过吗"，没验证过的域名一律拒绝。
5. 备份：
   - 每天导出数据库，命令是 `docker compose exec db pg_dump -U sites sites > backup.sql`；
   - 图片如果放在 R2，就不用另外备份。

## 必填环境变量

| 变量 | 作用 |
| --- | --- |
| `DATABASE_URL` | 生产数据库。不填会用嵌入式数据库，那只适合本地开发，部署到 Vercel 会丢数据 |
| `ADMIN_BASE_URL`、`ADMIN_HOST` | 后台地址。邮件里的链接都用它 |
| `SETUP_CODE` | 第一次打开网站时创建平台管理员要输入的口令（`/admin/setup`，只在还没有任何账号时开放）。也可以用命令行：`ADMIN_PASSWORD='…' npx tsx scripts/create-admin.ts 你的邮箱 "你的名字"`。不要在生产库上跑 `db:import`，它会导入示例站 |
| `RESEND_API_KEY`、`EMAIL_FROM` | 发邮件。不填的话，邀请、找回密码、询盘通知都发不出去 |
| `CRON_SECRET` | 一串随机字符，保护定时任务地址 |
| `WEBHOOK_SECRET`、`IP_HASH_SALT` | 各一串随机字符 |
| `BLOB_READ_WRITE_TOKEN`（连接 Vercel Blob 时自动设置），或 `STORAGE_DRIVER=s3` 和 `S3_*`、`STORAGE_PUBLIC_URL` | 图片存储 |
| `PLATFORM_DOMAIN`、`PLATFORM_CNAME_TARGET`、`PLATFORM_A_RECORDS`、`DOMAIN_PROVIDER` | 客户域名 |
| `ANTHROPIC_API_KEY` | AI 写文案。不填就用演示写手 |
| `ALLOW_SIGNUP` | `true` 表示任何人都能注册建站；`false` 表示只能被邀请 |
| `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` | 可选，"用 Google 登录" |

随机字符可以用这条命令生成：`openssl rand -hex 32`。

## 第一个真实客户上线清单

1. 用后台"New site with AI"生成网站。也可以让客户自己注册生成（需要 `ALLOW_SIGNUP=true`）。
2. 补齐进度页列出的占位符，换上客户的真实照片。
3. 让客户（必要时请律师）看过隐私政策、条款和无障碍声明，在"Publish & history"里确认后发布。
4. 在"Team"里邀请客户的同事。
5. 在"Domains"里添加客户的 `www.客户域名.com` 和 `客户域名.com`。
   - 把页面上显示的两条 DNS 记录发给客户，让他们在域名注册商那里添加；
   - 等状态变成 Ready，再把 `www` 设为主地址。另一个地址会自动 301 跳转过去，广告点击参数也会保留。
6. 在客户网站上提交一条测试询盘，确认：
   - 团队邮箱收到了通知；
   - 访客收到了自动回复；
   - 后台询盘列表里能看到；
   - 如果配了 CRM webhook，CRM 里也有。
7. 让客户在 Google Search Console 添加网站，把平台的服务账号加为用户，再在"Company & settings"填写属性。之后每次发布都会自动提交 sitemap。
8. 打开 `https://app.yourplatform.com/api/health`，确认数据库、存储、邮件都是正式配置。

## 上线后要关注的

- **`/api/health`**：可以接一个免费的监控服务（比如 UptimeRobot），每分钟访问一次，出问题会通知你。
- **邮件送达**：在 Resend 后台看退信和投诉。退信率高要先查发信域名的 SPF/DKIM。
- **数据库备份**：Neon 和 Supabase 自带每日备份；自建服务器请按上面的命令每天导出。

## 平台管理后台

平台管理员（第一次设置时创建的账号，或在后台被授权的人）打开 `/platform`，可以：

- **看全局**：用户、网站、询盘、发布次数、AI 用量（token 数）、邮件发送情况、自定义域名；
- **看需要处理的问题**：失败的任务、发送失败的邮件、放弃重试的 CRM webhook、卡住超过一天的域名；
- **管理网站**：
  - 查看任意网站的团队、域名、发布记录、AI 用量、邮件；
  - 暂停（网站下线，必须填原因）和恢复；
  - "Support access"：以所有者身份加入客户的团队，帮客户处理问题。客户在 Team 页能看到你，处理完点"End support access"退出；
- **管理用户**：停用（立即在所有设备退出，客户网站照常在线）、启用、授予或收回平台管理员；
- **审计日志**：上面每个操作都记录了谁、什么时候、做了什么。
