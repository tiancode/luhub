# LuHub 采集器（Python）

Python 负责**抓取 + 解析**，输出 maccms 形状的 JSON；TS 侧的 `ingestResponse`
（`src/collect/maccms.ts`）负责**写库**。两侧职责分明：写库 / 分类映射逻辑只在 TS
一处，数据库始终单写，无重复、无 schema 漂移。

```
Python (crawler/)  --stdout JSON-->  TS bridge (src/collect/python.ts)  -->  ingestResponse  -->  DB
```

## 运行

无需任何依赖即可跑 maccms 适配器（仅用标准库）：

```bash
# 仅看 Python 输出（maccms 形状的页数组）
python3 -m crawler.run --adapter maccms --api https://站点/api.php/provide/vod/ --pages 3

# 端到端：抓取 -> 解析 -> 入库（经 TS bridge）
pnpm collect:py --adapter=maccms --api=https://站点/api.php/provide/vod/ --name=某资源站 --pages=3
pnpm collect:py --adapter=maccms --api=... --hours=24      # 增量
```

HTML 网页采集需要额外依赖：

```bash
pip install -r crawler/requirements.txt
pnpm collect:py --adapter=html_example --base-url=https://站点 --name=某站
```

## 本地 mock 站点（测试）

纯测试用的仿真站点（假数据、假 m3u8，无任何真实第三方内容），用于离线开发与
调通"列表 → 同域详情 → 解析 m3u8 → 入库"全流程，不接触任何真实站点。

一键 demo（起 mock 服务 → 采集入库 → 自动关服务）：

```bash
pnpm demo:mock
# 可选: PORT=8901 PAGES=5 NAME=本地Mock站 pnpm demo:mock
```

或手动两步：

```bash
# 终端 1：启动 mock 站点
python3 -m crawler.mocksite.server --port 8900
# 终端 2：用 mocksite 适配器站内爬取并入库
pnpm collect:py --adapter=mocksite --base-url=http://127.0.0.1:8900 --name=本地Mock站 --pages=5
```

`crawler/adapters/mocksite.py` 演示了真实的站内爬取写法（urllib 抓取 + BeautifulSoup
解析，列表页跟随同域详情链接、组装多线路 m3u8），可作为编写真实站点适配器的范本。

## 输出契约

`python -m crawler.run` 向 **stdout** 打印一个 JSON 数组，每个元素是一页 maccms
响应：`{ code, msg, page, pagecount, class:[{type_id,type_name}], list:[MaccmsVod] }`。
诊断信息一律走 **stderr**，不污染 stdout 的 JSON。

播放地址用 `crawler/models.py` 的 `build_play()` 组装成 maccms 的
`vod_play_from` / `vod_play_url`（与 `src/collect/parse.ts` 互逆）。

## 新增一个适配器

1. 在 `crawler/adapters/` 新建文件，继承 `Adapter`（`adapters/base.py`），实现：
   - `fetch_page(self, page, *, hours=None, **opts) -> dict`：抓取并归一化一页。
   - `from_cli(cls, args)`：从 CLI 参数构造实例。
   - 可选：覆盖 `rate_limit_ms` 限速；翻页/限速由基类 `crawl()` 处理。
2. 在 `crawler/registry.py` 的 `ADAPTERS` 登记。
3. 用 `pnpm collect:py --adapter=<名字> ...` 调用。

参考模板：`crawler/adapters/html_example.py`（HTML 站点）、`crawler/adapters/maccms.py`（API）。

## 与后台 / 调度的关系

- 当前后台 `/admin` 的「采集」走 TS 原生 maccms（`syncSource`）。要让后台改用某个
  Python 适配器，可在采集动作里调用 `syncViaPython(sourceId, opts)`（`src/collect/python.ts`）
  —— 这是后续接线点，等有了真实适配器再按需打通。
- 定时采集：让系统 cron / CI 直接跑 `pnpm collect:py ...` 即可。

## 合规

仅采集你有权使用的资源；HTML 采集对改版敏感，务必限速并尊重对方 robots 与服务条款。
