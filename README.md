# B2B 制造商建站平台（阶段 1–5 + 平台管理后台）

一个多租户建站平台：每个客户网站 = 数据库里的一份内容数据 + 一套固定的区块组件。
第一个行业模板是"美国 B2B 制造商 / 贴牌 / 批发"询盘型官网；示例公司 **Meridian Bay Formulations 是虚构的**。

- **阶段 1**：区块库、设计令牌、页面模板、SEO 层、示例站数据。
- **阶段 2**：
  - 数据进数据库、多租户路由、后台编辑器、草稿预览；
  - 发布、版本与回滚；
  - 产品与品类管理、图片上传、表格导入；
  - 询盘落库、邮件通知与自动回复、CRM webhook、防垃圾与限流。
- **阶段 3**：
  - 发布前自动 SEO 体检（爬取草稿预览），有错误就拦下发布，并直接链接到出问题的区块；
  - 上传图片自动生成 480/960/1600 宽的 WebP，网页按屏幕大小加载；
  - 404 日志（按次数排序，一键建重定向）、重定向管理（禁止循环）；
  - 发布后向 Google Search Console 提交 sitemap（需配置服务账号）。
- **阶段 4**：AI 一键生成。填问卷、传 Logo 和产品表 → 确认页面规划 → 自动写出整站草稿 → 补齐占位符后发布。
- **阶段 5**：上线准备。部署步骤和第一个客户的上线清单见 **`DEPLOY.md`**。
  - 正式账号体系：邀请成员、找回密码、自助注册（可关）、用 Google 登录、防暴力猜密码；
  - 图片存 Cloudflare R2；
  - 客户自定义域名（DNS 验证 + 自动 HTTPS + 主地址跳转）；
  - 法律页面须企业确认后才能发布；
  - AI 生成改成持久任务队列（服务器重启后自动继续）；
  - Docker 和 Vercel 两套部署配置，健康检查，安全响应头。

## 快速开始（本地）

```bash
npm install
cp .env.example .env.local         # 本地可以全部留空
npm run db:import                  # 建库、导入示例站并发布第 1 版、创建管理员
npm run dev                        # 网站 http://localhost:3000 ，后台 http://localhost:3000/admin
```

- 本地默认管理员：`owner@example.com` / `change-me-now`。
- 生产环境不要运行 `db:import`（它会导入示例站）。用 `scripts/create-admin.ts` 创建第一个账号，详见 `DEPLOY.md`。
- 本地数据库是嵌入式 PostgreSQL（PGlite），存在 `.data/` 目录。
- 上线时设置 `DATABASE_URL` 即可切换到真正的 Postgres（比如 Supabase 美国区），代码不用改。

## 它是怎么工作的

| 环节 | 做法 |
| --- | --- |
| 找到站点 | `middleware.ts` 把每个公开请求改写到 `/s/<域名>/<路径>`；页面再按 `domains` 表找到站点 |
| 草稿与发布 | 后台改的是数据表里的草稿。"发布"把草稿组装成一个完整站点，通过校验后存为一个版本。访客只看到最新发布的版本 |
| 回滚 | 任一历史版本可一键恢复，恢复本身也记成一个新版本 |
| 后台表单 | 由 zod schema 自动生成（`components/admin/SchemaForm.tsx`）。新增区块类型不用写后台代码 |
| 预览 | `/preview/<站点>/…` 用同一套组件渲染草稿，只有登录的编辑能看 |
| 改网址 | 改页面、产品或品类的地址时自动生成 301 重定向，旧链接不失效 |
| 询盘 | `/api/inquiry` → 存库 → 给访客返回成功 → 后台再发团队通知、自动回复和 CRM webhook（失败重试 3 次） |
| 防垃圾 | 隐藏字段、提交过快、一次性邮箱、链接过多 → 标记为垃圾、不通知；同一 IP 10 分钟最多 5 次；可选 Cloudflare Turnstile |
| 来源追踪 | 记录访客进站时的 UTM 和广告点击 ID（gclid、fbclid 等），随询盘一起保存，后台可按渠道筛选和导出 |
| SEO 体检 | 发布时先用同一套规则爬一遍草稿预览（`lib/seo-check.ts` + `lib/audit-core.mjs`）：标题、描述、H1、alt、死链、坏图、canonical 等。有错误不能发布 |

## AI 一键生成（阶段 4）

入口：后台 `/admin` → "New site with AI"（或左侧栏 "+ New site with AI"）。

**原则：AI 只填写固定格式的 JSON，不写代码，也不能自己添加事实。** 结构、链接、按钮、图片、导航、数字都由代码决定。

| 步骤 | 谁来做 | 说明 |
| --- | --- | --- |
| 1. 问卷 | 用户 | 公司信息、服务（1–4 个）、认证、起订量、交期、真实评价（可选）、Logo、产品表 |
| 2. 品牌 | 代码 | 按行业选风格包；从 Logo 取主色并自动调暗到文字对比度达标（WCAG AA）；不达标就用风格包原色 |
| 3. 规划 | 模型 + 代码 | 模型提议页面和区块；代码强制规则：首块能承载 H1、没有评价就不放评价区块、不放无法核实的数字和客户 Logo、必备页面（首页、联系、感谢、隐私、条款、无障碍）一定存在、品类和产品表完全一致 |
| 4. 用户确认 | 用户 | 可取消页面、调整品类归属哪个服务、修正表格列对应关系。此时还没有写任何文案 |
| 5. 生成 | 后台任务 | 先写骨架（页面、导航、页脚、法律页、表单），再按表格导入产品（原样导入，不经过 AI），然后逐个区块写文案、逐个品类写介绍、逐页写标题和描述 |
| 6. 检查 | 代码 | 每个回答都用 zod 校验，不合格就带着错误重试 2 次；仍失败就保留 `[[TODO]]` 占位（会拦下发布），进度页可单独"Retry" |
| 7. 发布 | 用户 | 进度页列出要补的占位符并链接到对应区块；之后走正常的发布流程（含 SEO 体检） |

- 每次模型调用都记录在 `ai_jobs` 表；整个生成的输入、规划和结果在 `site_generations` 表。
- 运行时提示词是 `ai-prompts/*.md` 普通 Markdown，可以直接改，不用改代码。
- 新站先用临时地址 `<站点id>.<PLATFORM_DOMAIN>`，绑定自己的域名后切换。
- **模型**：设置 `ANTHROPIC_API_KEY` 后由 Claude（默认 `claude-sonnet-5-5`，可用 `AI_MODEL` 改）写文案，使用结构化输出。
  没有密钥时用"演示写手"：只把问卷里的事实套进固定句式，用来演示和测试整个流程，文字比较模板化。
- 生成在服务器进程里后台执行（Next.js `after()`）。正式上线、站点多了以后，建议改成独立的任务队列（见阶段 5）。

## 平台管理后台（/platform）

只有平台管理员能进，功能说明见 `DEPLOY.md` 末尾。

- **全局概览**：用户、网站、询盘、发布、AI 用量（按 token 计）、邮件、域名、最近 14 天趋势，以及需要处理的问题；
- **网站**：搜索和筛选；单个网站的团队、域名、发布、AI 用量、邮件；暂停和恢复；支持访问（加入客户团队，客户看得到）；
- **用户**：停用（立即退出所有设备）和启用；授予或收回平台管理员；
- **审计日志**：所有操作都有记录；
- **首次部署**：数据库里还没有账号时，`/admin/setup` 创建第一个平台管理员（可用 `SETUP_CODE` 保护）。

## 上线相关（阶段 5）

| 环节 | 做法 |
| --- | --- |
| 账号 | 邮箱 + 密码（至少 10 位），可选"用 Google 登录"（OIDC + PKCE，只认已验证邮箱）。同一邮箱或同一 IP 15 分钟内输错 8 次就暂停登录 |
| 团队 | 所有者在"Team"页邀请成员（所有者或编辑）。邀请链接 7 天有效、只能用一次。每个站至少保留一个所有者 |
| 找回密码 | 链接 60 分钟有效、只能用一次；不论邮箱存不存在，回答都一样；重置后其他设备全部退出登录 |
| 自助注册 | `ALLOW_SIGNUP=true` 时开放，注册后直接进入 AI 建站向导；否则只能被邀请 |
| 图片存储 | 本地磁盘、Cloudflare R2（`STORAGE_DRIVER=s3`）或 Vercel Blob（连接后自动启用）。后两种图片直接从存储的公开地址加载，不经过网站服务器 |
| 客户域名 | 客户添加 TXT 记录证明所有权、CNAME/A 记录指向平台 → 平台检查 → SSL 服务商签发证书 → 设为主地址。其他地址 308 跳转到主地址，并保留广告参数 |
| 法律页面 | 生成的隐私政策、条款、无障碍声明带"示例文本"标记，会拦下发布；所有者确认审阅后标记才会去掉，并记录确认人和时间 |
| 后台任务 | `jobs` 表做持久队列，带租约：服务器中途停掉，任务会被定时任务重新接手 |
| 定时任务 | `/api/cron/deliver` 每 5 分钟：重试邮件和 webhook、检查等待中的域名、执行排队任务 |
| 运维 | `/api/health` 健康检查；安全响应头；后台禁止搜索引擎收录；设置 `ADMIN_HOST` 后后台只在该域名提供 |

## 目录

| 位置 | 内容 |
| --- | --- |
| `schema/` | 全部 zod 定义：区块、站点、主题、询盘；`validate.ts` 是发布前校验 |
| `db/schema.sql`、`db/client.ts` | 建表语句；一个同时支持 PGlite 和 Postgres 的查询接口 |
| `lib/repo/` | 所有数据读写：站点与版本、编辑、图片、表格导入、询盘、重定向与 404 |
| `lib/ai/` | AI 生成：模型接口（`model.ts`）、演示写手（`mock.ts`）、品牌配色（`brand.ts`）、提示词加载、生成流程（`pipeline.ts`） |
| `lib/seo-check.ts`、`lib/audit-core.mjs` | 发布前 SEO 体检；命令行体检用同一套规则 |
| `lib/auth/` | 登录会话、账号与邀请、找回密码、Google 登录 |
| `lib/domains.ts`、`lib/jobs.ts`、`lib/legal.ts`、`lib/storage.ts` | 客户域名、任务队列、法律页面确认、文件存储（本地或 R2） |
| `Dockerfile`、`deploy/`、`vercel.json`、`DEPLOY.md` | 部署配置和上线指南 |
| `app/s/[host]/` | 客户网站（页面、sitemap.xml、robots.txt） |
| `app/preview/` | 草稿预览 |
| `app/admin/` | 后台：仪表盘、页面、页头页脚、产品、品类、图片、询盘、发布与历史、重定向与 404、主题、公司设置 |
| `app/admin/new/` | AI 建站向导：问卷、规划确认、生成进度 |
| `app/api/inquiry`、`app/api/cron/deliver` | 询盘接收；定时重试 |
| `components/blocks/` | 20 种区块的渲染组件 |
| `components/admin/` | 后台组件（表单引擎、页面编辑器、导入向导等） |
| `data/` | 示例站的 JSON 数据（AI 生成的产物就是这个格式） |
| `ai-prompts/` | AI 生成时用的提示词（规划、写区块、品类介绍、页面 SEO） |
| `tests/` | 端到端测试、webhook 重试、AI 接口与生成流程测试；`tests/fixtures/` 是虚构食品代工厂的问卷、Logo 和产品表 |
| `PROMPTS-给AI编程工具.md` | 后续阶段给 AI 编程工具的分步提示词 |

## 测试

```bash
npm run typecheck && npm run validate
npm run test:webhooks       # webhook 重试节奏（需要下面的 mock 服务）
npm run test:ai-adapter     # Claude 接口的请求格式、校验与重试（本地假服务，不联网）
npm run test:generation     # 不开网页，直接跑一遍 AI 生成（演示写手）
npm run test:jobs           # 任务队列：去重、中断恢复、失败重试
npm run test:blob           # Vercel Blob 存储（需要 mock-cloud）

# 端到端（需要 Python Playwright）。每个套件前都重置数据库，并清掉 Next 的数据缓存：
python3 tests/mock-services.py 4555 .data/mock-log.jsonl &   # 模拟邮件 API 和 CRM
node tests/mock-cloud.mjs 4557 &                              # 模拟 DNS、Vercel、Google 登录、R2
rm -rf .data .next/cache/fetch-cache && npm run db:import
npx tsx scripts/set-setting.ts demo crmWebhookUrl http://localhost:4555/hook
npm run build && RESEND_API_KEY=test RESEND_API_URL=http://localhost:4555/emails CRON_SECRET=testcron npm start &
npm run test:e2e                                  # 阶段 2
npm run test:e2e:phase3
# 阶段 4：启动时加 AI_MOCK_FAIL="block:faq@/faq"，让一个区块失败一次，用来测试 Retry
npm run test:e2e:phase4
# 阶段 5：启动时加载 tests/phase5.env 里的设置，即 env $(xargs < tests/phase5.env) npm start
npm run test:e2e:phase5
# 平台管理后台：需要 PostgreSQL，从空数据库启动（DATABASE_URL=postgres://… npm start）
npm run test:e2e:platform
npm run audit               # 爬取运行中的网站做 SEO 体检；加 --host 某域名 可检查其他站
```

**最近一次结果（2026-10-14）**：

| 阶段 | 测试 | 结果 |
| --- | --- | --- |
| 阶段 2 | 端到端 | 32/32 |
| 阶段 2 | webhook 重试 | 5/5 |
| 阶段 3 | 端到端 | 11/11 |
| 阶段 4 | 端到端 | 30/30 |
| 阶段 4 | AI 接口（含 token 用量统计） | 9/9 |
| 阶段 4 | 生成流程 | 8/8 |
| 阶段 5 | 端到端 | 41/41 |
| 阶段 5 | 任务队列 | 6/6 |
| 阶段 5 | Vercel Blob 存储 | 4/4 |
| 平台管理后台 | 端到端 | 36/36 |

另外验证过：
- **真实 PostgreSQL 16（生产用的数据库路径）**：阶段 2、阶段 4、阶段 5 的端到端和任务队列在它上面重跑，全部通过；平台管理后台的端到端就是在它上面跑的，从空数据库开始；
- **线上 SEO 体检**：生成的虚构站（Prairie Pantry 食品代工）发布后，23 页、83 张图、379 个内链全部通过；
- **独立部署包**：`NEXT_OUTPUT=standalone` 单独启动后，首页、后台、健康检查都正常。

端到端测试按方案文档的验收标准逐项验证：
- 不改代码，改首屏文案、换图、加 FAQ，预览立即更新；
- 有占位符时禁止发布，并指出具体页面和区块；
- 发布后线上更新；改产品地址后旧链接自动跳转；
- 表格导入能新建、能更新，失败行给出原因；
- 带 gclid 进站后提交 5 种询盘，邮件和 webhook 全部送达，后台按渠道筛出 5 条，CSV 导出完整；
- 机器人提交被静默记为垃圾；同一 IP 第 6 次请求被限流；
- 不达标的配色被拒绝；回滚到第 1 版成功；未登录不能看草稿；
- 链接坏了不能发布并能一键跳到对应区块；手机加载小尺寸图片；404 记录可一键转重定向，循环重定向被拒绝；
- AI 向导：输入有误时保留已填内容；规划来自问卷和产品表；取消的页面不生成；失败区块可单独重试；
  法律页面未确认时不能发布；生成的站通过校验和 SEO 体检后发布，在临时域名上可访问，示例站不受影响；
- 账号：
  - 邀请链接只能用一次，编辑看不到所有者菜单，最后一个所有者不能降级；
  - 找回密码后旧密码失效、其他设备退出；
  - 不存在的邮箱也得到同样的回答；
  - Google 登录能关联到已有账号，伪造的回调被拒绝；
  - 连续输错 8 次后暂停登录；
- 存储与域名：
  - 上传的图片带签名存进 R2，并从 R2 地址加载；
  - 未验证的域名不提供网站；DNS 验证 → 证书 → 设为主地址后，其他地址带着广告参数 308 跳转，canonical 和 sitemap 立即改用新域名。

## 还没做的（阶段 6 及以后）

- **用真实服务跑一遍**：真实的 Anthropic 密钥、Resend、R2、Vercel 或 Caddy、Google 登录。本次全部用本地模拟服务测试，沙盒无法访问外网。
- **计费**：客户套餐、付款（例如 Stripe），以及按套餐限制站点数和 AI 生成次数。
- **其他**：博客、CRM 原生对接、更多行业模板、多语言、GEO 优化（见规格文档阶段 6）。
