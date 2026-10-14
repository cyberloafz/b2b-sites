# 给 AI 编程工具的分步提示词（阶段 3 起；阶段 3–5 已完成）

阶段 1（区块库、模板、SEO 层）和阶段 2（数据库、后台、发布、询盘）已完成并通过测试。
使用方法：
1. 每次开一个新任务，先发"通用开场"，再发对应阶段的提示词。
2. 一次只做一个阶段，验收通过再进入下一个。
3. 把本项目代码和《AI 建站平台 · B2B 制造商模板规格方案》一起提供给工具。

---

## 通用开场（每次都先发）

```
你在维护一个多租户 B2B 建站平台（Next.js 15 App Router + PostgreSQL）。核心原则：
- 每个网站 = 数据库里一份通过 zod 校验的内容 + 一套固定的区块组件。AI 和用户只改数据，不改组件代码。
- H1、标题层级、alt、canonical、结构化数据由渲染层强制。
- 后台改的是草稿；发布时组装、校验、存为版本；访客只看最新发布版本。

先阅读：README.md、schema/*.ts、db/schema.sql、db/client.ts、lib/repo/*.ts、components/RenderBlocks.tsx、lib/seo.ts。
- 所有数据库访问都通过 db/client.ts 的 q / one / tx，所有写入都先用 schema/ 里的 zod 校验。
- 后台的每个 server action 先调用 requireSite()。
- 不要修改已有规则，除非我明确要求；新增功能要复用它们。

每完成一步，运行：npm run typecheck、npm run validate、npm run build、npm run test:webhooks，
以及 README"测试"一节里的端到端测试和 npm run audit，全部通过再告诉我。
新功能要在 tests/e2e_admin.py 里加对应的检查。
用中文向我汇报：做了什么、怎么验证的、还有什么没做。
```

---

## 阶段 3 · SEO 引擎产品化（已完成）

```
1. 后台"发布与历史"页增加"SEO 体检"：
   - 在服务器端渲染草稿的每个页面（复用 app/preview 的渲染），对每页执行 lib/audit-core.mjs 的 auditPage，跨页执行 auditSite。
   - 结果按页面列出，每条可点击跳到对应的页面编辑器和区块。
   - 规则分两级：H1 数量、缺 alt、死链、canonical 错误为"错误"，阻止发布；标题和描述长度、重复为"警告"。
2. 图片：上传时用 sharp 生成 WebP 和 3 个宽度（480/960/1600），渲染时输出 srcset 和 sizes；保留原图。
3. 404 日志：记录站点上访问到不存在页面的路径和次数，后台列出前 50 条，可一键创建重定向。
4. 重定向管理页：手动新增、删除重定向；禁止形成循环。
5. Google Search Console：企业授权后，每次发布自动提交 sitemap（先做成接口和后台设置项，授权流程可以放后面）。
验收：故意把一个产品标题改到 80 字符、删一张图的 alt，体检能拦下并直接跳到对应字段；sitemap 自动更新。
```

---

## 阶段 4 · AI 一键生成（已完成，以下为实现说明，供后续修改参考）

```
已实现（lib/ai/、app/admin/new/、ai-prompts/）：
1. 新建站点向导 /admin/new：问卷 + Logo + 产品表格（复用 lib/repo/import.ts 的解析和导入）。
2. 品牌与风格（lib/ai/brand.ts）：按行业选风格包；从 Logo 提取主色并调到对比度达标；不达标用风格包原色。
3. 站点规划：ai-prompts/1-plan-site.md → schema/questionnaire.ts 的 enforcePlanRules 强制规则 → 用户确认。
4. 内容生成：每个区块调用 ai-prompts/2-write-block.md，结构化输出只包含该区块的文案字段；
   链接、按钮、图片、id 由代码补上；zod 校验失败重试 2 次，仍失败留 [[TODO]]，进度页可单独重试。
5. 产品：按表格原样导入，不经过 AI。品类介绍：ai-prompts/3-category-intro.md（含产品描述原文，避免空泛和重复）。
6. 页面标题和描述：ai-prompts/4-page-seo.md，代码保证标题不重复；品类页和产品页用 lib/seo.ts 的模板。
7. writeDraft 写入草稿 → validateSite → 进度页列出占位符并链接到对应区块。

后续可做：
- 把 runGeneration 从 after() 换成任务队列（如 Postgres 的 SKIP LOCKED 轮询或托管队列），支持服务器重启后继续。
- 认证文件上传后由人工核对再写入 certifications。
- 用真实模型生成 3–5 个不同行业的站，人工评审文案后迭代提示词。
```

---

## 阶段 5 · 上线发布（已完成，部署步骤见 DEPLOY.md）

```
已实现：
1. 账号（lib/auth/）：
   - 邀请成员（7 天、一次性）、找回密码（60 分钟、一次性，重置后其他会话失效）；
   - 自助注册（ALLOW_SIGNUP）、Google 登录（OIDC + PKCE，jose 校验 id_token）；
   - 按邮箱和 IP 限制登录失败次数；
   - requireSite() 接口不变。
2. 存储（lib/storage.ts）：local | s3（Cloudflare R2，aws4fetch 签名），图片从 STORAGE_PUBLIC_URL 直接加载，srcset 同样适用。
3. 自定义域名（lib/domains.ts、/admin/[site]/domains）：
   - TXT 证明所有权 + CNAME/A 指向平台，DNS 通过 DoH 检查；
   - SSL 服务商可选：vercel / cloudflare(for SaaS) / caddy(on-demand，询问 /api/domains/allowed) / manual；
   - 主地址：其他地址 308 跳转（保留查询参数），canonical 和 sitemap 实时跟随，不用重新发布。
4. 部署：Dockerfile（standalone）、deploy/docker-compose.yml + Caddyfile、vercel.json 定时任务、/api/health、安全响应头、ADMIN_HOST。
5. 合规页面：示例法律文本拦下发布，所有者确认后去掉标记并记录确认人和时间（lib/legal.ts）。
6. AI 生成改成持久任务队列（lib/jobs.ts，租约 + SKIP LOCKED），定时任务负责接手中断的任务。
```

---

## 阶段 6 · 商业化与增强（下一步）

```
1. 计费：
   - 接入 Stripe Checkout + Customer Portal；
   - 套餐表（站点数、AI 生成次数、自定义域名数）；
   - 在 startSite、addDomain、inviteMember 处检查额度；
   - webhook 同步订阅状态；欠费时网站保持在线，后台只读。
2. 平台管理后台（/platform）：
   - 只有平台运营者能进；
   - 列出客户、站点、发布次数、询盘数、AI 用量（ai_jobs）、邮件退信；
   - 可以以只读身份查看任一站点。
3. 用真实服务验收：
   - 真实 ANTHROPIC_API_KEY，为 3 个不同行业各生成一次，人工评审文案后迭代 ai-prompts/；
   - Resend 发信域名验证；R2 + 自定义媒体域名；一个真实客户域名走完 DNS → SSL → 主地址。
4. 其后：博客区块与文章页、HubSpot/Salesforce 原生对接、更多行业模板、多语言（hreflang）、GEO（llms.txt、更细的结构化数据）。
验收：一个付费客户自助注册、付款、生成、绑定域名、上线，全程不需要平台人工介入。
```
