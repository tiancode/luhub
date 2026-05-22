"""本地 mock 视频站 —— 纯测试假数据，无任何真实第三方内容。

提供仿真的列表页 / 详情页 HTML（含分页、多线路、假 m3u8），用于离线开发与
调通"列表 → 详情 → 解析 → 入库"全流程，避免接触任何真实站点。

运行: python3 -m crawler.mocksite.server [--port 8900] [--host 127.0.0.1]
"""
from __future__ import annotations

import argparse
from html import escape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

PER_PAGE = 4

# 假目录（全部为虚构内容）。lines: [(线路名, 集数), ...]
CATALOG = [
    {"id": 1001, "name": "无尽列车", "type_id": 4, "type_name": "动漫", "year": 2024, "area": "日本", "remarks": "更新至12话", "desc": "一列永不停站的列车上发生的故事。", "lines": [("线路A", 12), ("线路B", 12)]},
    {"id": 1002, "name": "星海食堂", "type_id": 4, "type_name": "动漫", "year": 2023, "area": "日本", "remarks": "全24话", "desc": "宇宙尽头一家温暖的小餐馆。", "lines": [("线路A", 24)]},
    {"id": 1003, "name": "机巧之心", "type_id": 4, "type_name": "动漫", "year": 2024, "area": "日本", "remarks": "更新至08话", "desc": "少女与自律机器人的旅途。", "lines": [("线路A", 8), ("线路B", 8)]},
    {"id": 1004, "name": "山海绘卷", "type_id": 5, "type_name": "国创", "year": 2022, "area": "中国", "remarks": "全39话", "desc": "取材自上古神话的国产动画。", "lines": [("线路A", 39)]},
    {"id": 1005, "name": "霓虹追缉", "type_id": 4, "type_name": "动漫", "year": 2021, "area": "日本", "remarks": "全12话", "desc": "赛博都市里的一场追捕。", "lines": [("线路A", 12), ("线路B", 12)]},
    {"id": 1006, "name": "白塔奇谭", "type_id": 5, "type_name": "国创", "year": 2024, "area": "中国", "remarks": "更新至20话", "desc": "修行者攀登传说之塔。", "lines": [("线路A", 20)]},
    {"id": 1007, "name": "夏日信号", "type_id": 4, "type_name": "动漫", "year": 2023, "area": "日本", "remarks": "全13话", "desc": "海边小镇的青春群像。", "lines": [("线路A", 13)]},
    {"id": 1008, "name": "棋魂再启", "type_id": 4, "type_name": "动漫", "year": 2020, "area": "日本", "remarks": "全25话", "desc": "少年与棋灵的羁绊。", "lines": [("线路A", 25), ("线路B", 25)]},
]
BY_ID = {it["id"]: it for it in CATALOG}
PAGECOUNT = (len(CATALOG) + PER_PAGE - 1) // PER_PAGE


def render_list(page: int) -> str:
    items = CATALOG[(page - 1) * PER_PAGE : page * PER_PAGE]
    cards = "\n".join(
        f'''<a class="card" href="/vod/{it['id']}.html">
  <img class="cover" src="https://mock.local/cover/{it['id']}.jpg" alt="{escape(it['name'])}">
  <span class="title">{escape(it['name'])}</span>
  <span class="remark">{escape(it['remarks'])}</span>
</a>'''
        for it in items
    )
    return f'''<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>Mock 列表 第{page}页</title></head>
<body>
<div class="list">
{cards}
</div>
<div class="pager" data-page="{page}" data-pagecount="{PAGECOUNT}"></div>
</body></html>'''


def render_detail(it: dict) -> str:
    playlists = []
    for from_name, ep_count in it["lines"]:
        line_key = from_name.replace("线路", "L")
        eps = "\n".join(
            f'  <a class="ep" href="https://mock.local/{it["id"]}/{line_key}/{i}.m3u8">第{i:02d}话</a>'
            for i in range(1, ep_count + 1)
        )
        playlists.append(
            f'<div class="playlist" data-from="{escape(from_name)}">\n{eps}\n</div>'
        )
    pl = "\n".join(playlists)
    return f'''<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>{escape(it['name'])}</title></head>
<body>
<h1 class="vod-title">{escape(it['name'])}</h1>
<img class="vod-cover" src="https://mock.local/cover/{it['id']}.jpg">
<div class="vod-meta" data-year="{it['year']}" data-area="{escape(it['area'])}" data-type-id="{it['type_id']}" data-type-name="{escape(it['type_name'])}"></div>
<div class="vod-desc">{escape(it['desc'])}</div>
{pl}
</body></html>'''


class Handler(BaseHTTPRequestHandler):
    def _send(self, body: str, status: int = 200) -> None:
        data = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:  # noqa: N802 (http.server 约定)
        u = urlparse(self.path)
        if u.path in ("/", "/list", "/list/"):
            q = parse_qs(u.query)
            page = max(1, min(PAGECOUNT, int((q.get("page", ["1"])[0]) or "1")))
            self._send(render_list(page))
            return
        if u.path.startswith("/vod/") and u.path.endswith(".html"):
            try:
                vid = int(u.path[len("/vod/") : -len(".html")])
            except ValueError:
                self._send("bad id", 400)
                return
            it = BY_ID.get(vid)
            self._send(render_detail(it) if it else "not found", 200 if it else 404)
            return
        if u.path == "/robots.txt":
            self._send("User-agent: *\nAllow: /\n")
            return
        self._send("not found", 404)

    def log_message(self, *args) -> None:  # 静音
        pass


class Server(ThreadingHTTPServer):
    allow_reuse_address = True


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(
        prog="python -m crawler.mocksite.server",
        description="本地 mock 视频站（纯测试假数据）",
    )
    p.add_argument("--port", type=int, default=8900)
    p.add_argument("--host", default="127.0.0.1")
    args = p.parse_args(argv)
    srv = Server((args.host, args.port), Handler)
    base = f"http://{args.host}:{args.port}"
    print(f"mock 站点运行于 {base}  （Ctrl+C 退出）")
    print(f"  列表: {base}/list/?page=1   共 {PAGECOUNT} 页 / {len(CATALOG)} 部")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()


if __name__ == "__main__":
    main()
