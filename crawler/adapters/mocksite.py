"""mock 站点采集适配器 —— 配合 crawler.mocksite.server 使用，演示真实的
"列表页 → 同域详情页 → 解析 m3u8 → 归一化 maccms" 站内爬取流程。

只请求 base_url 下的路径，不跨域扩散。真实站点适配器可照此结构编写
（用 BeautifulSoup 解析，参考本文件与 html_example.py）。
"""
from __future__ import annotations

import re
import urllib.request
from typing import Any

from ..models import build_play
from .base import Adapter

UA = "Mozilla/5.0 (luhub crawler; mock demo)"
_VOD_ID = re.compile(r"/vod/(\d+)\.html")


def _get(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310 (本地 mock)
        return resp.read().decode("utf-8", "replace")


class MockSiteAdapter(Adapter):
    name = "mocksite"
    rate_limit_ms = 200

    def __init__(self, base_url: str, **opts: Any) -> None:
        if not base_url:
            raise ValueError("mocksite 适配器需要 --base-url")
        self.base_url = base_url.rstrip("/")

    @classmethod
    def from_cli(cls, args: Any) -> "MockSiteAdapter":
        return cls(args.base_url)

    def fetch_page(self, page: int, *, hours: int | None = None, **opts: Any) -> dict:
        from bs4 import BeautifulSoup  # 延迟导入：不影响 maccms 适配器零依赖

        soup = BeautifulSoup(_get(f"{self.base_url}/list/?page={page}"), "html.parser")
        pager = soup.select_one(".pager")
        pagecount = int(pager.get("data-pagecount", "1")) if pager else 1

        classes: dict[str, str] = {}
        vods: list[dict] = []
        for card in soup.select("a.card"):
            m = _VOD_ID.search(card.get("href", ""))
            if not m:
                continue
            vod_id = m.group(1)
            detail = BeautifulSoup(
                _get(f"{self.base_url}/vod/{vod_id}.html"), "html.parser"
            )
            meta = detail.select_one(".vod-meta")
            type_id = meta.get("data-type-id") if meta else None
            type_name = meta.get("data-type-name", "") if meta else ""
            if type_id:
                classes[type_id] = type_name

            lines = [
                (
                    pl.get("data-from", "线路"),
                    [(a.get_text(strip=True), a.get("href", "")) for a in pl.select("a.ep")],
                )
                for pl in detail.select(".playlist")
            ]
            play_from, play_url = build_play(lines)

            title = card.select_one(".title")
            cover = card.select_one("img.cover")
            remark = card.select_one(".remark")
            desc = detail.select_one(".vod-desc")
            vods.append(
                {
                    "vod_id": vod_id,
                    "vod_name": title.get_text(strip=True) if title else "",
                    "type_id": type_id,
                    "type_name": type_name,
                    "vod_pic": cover.get("src", "") if cover else "",
                    "vod_remarks": remark.get_text(strip=True) if remark else "",
                    "vod_year": meta.get("data-year") if meta else None,
                    "vod_area": meta.get("data-area") if meta else None,
                    "vod_content": desc.get_text(strip=True) if desc else "",
                    "vod_play_from": play_from,
                    "vod_play_url": play_url,
                }
            )

        return {
            "code": 1,
            "msg": "ok",
            "page": page,
            "pagecount": pagecount,
            "class": [{"type_id": k, "type_name": v} for k, v in classes.items()],
            "list": vods,
        }
