# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

LuHub 是一个视频资源聚合站:**采集(maccms 接口 / HTML 爬虫)→ 入库 → 自建前端展示**,带一个密码保护的采集后台。包管理器是 **pnpm**。

## Commands

```bash
pnpm dev                 # 开发服务器 (http://localhost:3000)
pnpm build               # prisma generate && next build (Turbopack)
pnpm lint                # eslint
pnpm exec tsc --noEmit   # 类型检查（无专用脚本）

pnpm db:migrate          # prisma migrate dev —— 改完 schema 后跑（会重新生成客户端）
pnpm db:seed             # 写入 prisma/fixtures 的离线示例数据（无需联网即可预览）
pnpm db:reset            # 重置数据库
pnpm exec prisma generate  # 客户端与 schema 不同步时手动重生成

pnpm test                            # 全部单测 (Node 内置 node:test，经 tsx)
pnpm exec tsx --test tests/parse.test.ts   # 跑单个测试文件

pnpm collect --source=<名> --pages=5   # maccms CLI 采集（读 config/sources.ts）
pnpm collect:py --adapter=maccms --api=<URL> --name=<名>   # Python 爬虫 → 入库
pnpm demo:mock           # 起本地 mock 站点并端到端采集，离线自测爬虫管线
```

## Architecture

**maccms 是全站的归一化交换格式。** 任何采集源——TS maccms、Python 爬虫、离线 seed——都把数据整理成 maccms 形状的 `MaccmsResponse`(`src/collect/types.ts`),再交给**唯一写库入口** `ingestResponse(sourceId, resp)`(`src/collect/maccms.ts`)。它按 `(sourceId, sourceVodId)` upsert 影片、重建播放线路、并经 `resolveCategory` 自动建立分类映射。新增任何采集器都应**输出 maccms JSON 并调用 `ingestResponse`,不要直接写表**。播放地址的解析/反解见 `src/collect/parse.ts`(`parsePlay`)与 `crawler/models.py`(`build_play`,二者互逆)。

**数据模型**(`prisma/schema.prisma`):`Source → Video → PlaySource → Episode`;`Category` + `CategoryMap`(资源站 `type_id` → 本站分类);`CollectRun`(后台采集运行记录)。SQLite 经 better-sqlite3 driver adapter,单例在 `src/lib/prisma.ts`。注意:**schema 的 datasource 只有 `provider`,`DATABASE_URL` 来自 `prisma.config.ts`/环境变量**;生成的客户端在 `src/generated/prisma`(gitignore,需 `prisma generate`)。

**采集源的真相在数据库**(通过 `/admin` 管理),已取代手填的 `config/sources.ts`。CLI `scripts/collect.ts` 仍读 `config/sources.ts`,两者相互独立。

**前端**(App Router, `src/app/`):服务端组件直接经 `src/lib/videos.ts` 查 Prisma;所有页面 `export const dynamic = "force-dynamic"`;读异步 `searchParams` 用 `src/lib/searchParams.ts` 的 `pick` / `SearchParamsPromise`。播放器 `Player.tsx` 是客户端组件(hls.js)。Tailwind v4,设计令牌为 `globals.css` 里的 CSS 变量(`bg-surface` / `text-muted` / `text-primary` / `border-border` 等)——新 UI 复用这些,别引第三方组件库。

**采集后台**(`/admin`,`src/app/admin/` + `src/lib/admin/`):单密码鉴权。`proxy.ts`(Next 16 把 middleware 更名为 proxy,nodejs 运行时)守卫 `/admin/*`;cookie 存 `HMAC(ADMIN_PASSWORD)` 派生令牌。**`requireAdmin()` 在每个页面与每个 Server Action 里都要再校验一次**(Server Action 可被公网直接 POST)。鉴权拆分:`src/lib/admin/auth.ts`(纯 crypto,proxy 也 import 它)vs `src/lib/admin/session.ts`(用 next/headers 的 cookies)。变更全是 `src/lib/admin/actions.ts` 里的 Server Action。路由:`admin/login`(公开)+ `admin/(panel)/*`(受守卫的路由组,自带 layout)。手动采集用 `after()`(next/server)在响应后异步跑,结果写入 `CollectRun`;前端在有任务运行时用 `router.refresh()` 轮询。

**Python 爬虫框架**(`crawler/`):适配器只负责抓取+解析、输出 maccms JSON;TS 桥接 `src/collect/python.ts` 用 `spawn` 跑 `python -m crawler.run`、解析 stdout、喂给 `ingestResponse`(写库逻辑只留在 TS、单写)。maccms 适配器仅用标准库(零依赖);html/mocksite 适配器**延迟 import** bs4/httpx(以免破坏 maccms 的零依赖)。新增适配器:继承 `crawler/adapters/base.py` 的 `Adapter`、实现 `fetch_page` 与 `from_cli`、在 `crawler/registry.py` 登记。`crawler/mocksite/` 是本地测试站,`pnpm demo:mock` 跑完整离线管线。详见 `crawler/README.md`。

**部署**:单 Docker 镜像(网站 + 爬虫),SQLite 落在挂载卷 `/data`;`docker/entrypoint.sh` 启动时 `prisma migrate deploy`。Unraid/自托管见 `docker/README.md`。

## Next.js 16 gotchas (本仓库特有)

- 中间件文件是 **`proxy.ts`(非 `middleware.ts`)**,具名导出 `proxy`,nodejs 运行时。
- `cookies()` / `headers()` / `searchParams` / `params` 全部 **async**,必须 `await`;cookie 的 `.set`/`.delete` 只能在 Server Action 里。
- 数据变更走 **Server Actions**(`"use server"`),本项目没有 API 路由。
- 改 `prisma/schema.prisma` 后务必 `pnpm db:migrate`(否则 `src/generated/prisma` 与 schema 不同步、tsc 报错)。
- SQLite 单写:批量采集要串行(后台「采集全部」即逐源顺序执行)。

合规:只采集你有权使用的资源(见 `README.md` 合规声明)。
