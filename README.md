# LuHub 影视 —— 视频资源聚合站

从零搭建的**综合影视资源聚合站**。采集标准 maccms 资源接口（并支持 HTML 站点适配器补充），将元数据 + 播放地址入库，再以自建前端展示。

> 已实现：**浏览 + 筛选**（首页 / 分类列表 / 按分类·地区·年份·剧种筛选 / 分页 / 影片详情）、**在线播放**（详情页 hls.js 播放 m3u8，支持线路·剧集切换）、**站内搜索**（`/search?wd=` 按片名）、**采集后台**（`/admin`，密码登录；资源站管理 + 手动采集 + 采集记录 + 分类映射）。

## 技术栈
- **Next.js 16**（App Router）+ TypeScript + Tailwind CSS 4
- **Prisma 7** ORM + SQLite（开发）/ 可切 Postgres（上线），通过 better-sqlite3 driver adapter
- 采集脚本用 `tsx` 运行；单测用 Node 内置 `node:test`

## 快速开始
```bash
pnpm install
cp .env.example .env          # 配置 DATABASE_URL 与 ADMIN_PASSWORD（采集后台登录密码）
pnpm db:migrate               # 建表
pnpm db:seed                  # 写入离线示例数据（无需网络即可预览）
pnpm dev                      # http://localhost:3000
```

## 采集真实数据
1. 在 `config/sources.ts` 填入你有权使用的 maccms V10 资源站接口：
   ```ts
   { name: "示例", apiUrl: "https://站点/api.php/provide/vod/", kind: "maccms_json", enabled: true }
   ```
2. 执行采集：
   ```bash
   pnpm collect --source=示例 --pages=5        # 采集前 5 页
   pnpm collect --source=示例 --hours=24       # 增量：最近 24 小时更新
   pnpm collect --all --full                   # 采集所有启用源的全部页
   pnpm collect --api=https://.../provide/vod/ # 不改配置临时采集
   ```

### maccms V10 接口约定
- 端点：`/api.php/provide/vod/`
- 参数：`ac=detail`（含播放地址）/ `ac=list`、`t`(分类)、`pg`(页码)、`wd`(关键词)、`h`(最近 h 小时增量)、`at=json`
- 响应：`{ code, msg, page, pagecount, total, class[], list[] }`
- `vod_play_url`：`名称$URL#名称$URL`，多线路用 `$$$` 分隔，与 `vod_play_from` 一一对应（解析见 `src/collect/parse.ts`）

## 采集后台（`/admin`）
密码保护的运营后台，**数据库作为采集源的唯一真相**（推荐替代手填 `config/sources.ts`）。

1. 在 `.env` 配置 `ADMIN_PASSWORD`（未配置则后台始终上锁）。
2. 访问 `/admin`，用该密码登录（`proxy.ts` 守卫 `/admin/*`）。
3. **资源站**：增删改 / 启停采集源；逐个或「全部启用源」一键采集，可选页数 / 增量小时 / 全量；采集在响应后异步执行，结果记入「采集记录」。
4. **分类映射**：把资源站分类改指到本站分类，并编辑本站分类的分组与排序。

> `config/sources.ts` + `pnpm collect` 仍可用于脚本 / CI 采集，但与后台相互独立；后台以数据库中的资源站为准。

## 项目结构
```
config/sources.ts          采集源配置（部署者填写）
prisma/
  schema.prisma            数据模型 Source/Category/CategoryMap/Video/PlaySource/Episode
  seed.ts                  离线 fixture 入库
  fixtures/                示例 maccms 响应
src/
  collect/
    parse.ts               vod_play_url 解析（纯函数，可单测）
    maccms.ts              采集 + 入库（fetch / ingestResponse / syncSource）
    html/                  HTML 站点适配器接口 + 示例骨架
  lib/                     prisma 单例 / 查询 / 常量 / 列表参数
  lib/admin/               采集后台：鉴权 / 会话 / 查询 / 采集编排 / Server Actions
  components/              Header/Footer/VideoCard/FilterBar/Pagination/Player/...
  components/admin/        后台导航 / 资源站卡片 / 状态徽章 / 轮询刷新
  app/                     /(首页) /list /latest /search /vod/[id]
  app/admin/               采集后台（登录 + 仪表盘 / 资源站 / 分类映射）
proxy.ts                   /admin 鉴权守卫（Next 16 中间件，原 middleware）
scripts/collect.ts         采集 CLI
tests/parse.test.ts        解析单测
```

## 常用命令
| 命令 | 说明 |
|------|------|
| `pnpm dev` / `pnpm build` | 开发 / 生产构建 |
| `pnpm db:migrate` | 创建并应用迁移 |
| `pnpm db:seed` | 写入离线示例数据 |
| `pnpm db:reset` | 重置数据库 |
| `pnpm collect ...` | 采集资源站 |
| `pnpm test` | 运行解析单测 |
| `pnpm lint` | 代码检查 |

## 后续规划
1. 定时采集（外部 cron 触发受密钥保护的接口）
2. 播放历史 / 收藏

## 合规声明
本项目仅作技术学习与索引展示用途，不存储/不上传任何音视频文件。所有数据源均由部署者自行配置，请仅采集你有权使用的资源，遵守对方 robots 与服务条款，尊重版权、支持正版。
