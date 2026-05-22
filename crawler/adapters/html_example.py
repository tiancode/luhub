"""HTML 网页采集模板。

适用于「没有 maccms 接口、只能解析网页」的站点。把抓到的列表卡片 + 详情页
归一化为 maccms 形状，复用 TS 的 ingestResponse 入库。

这是**模板**：请按目标站点替换 URL 规则与 CSS 选择器后再启用。
依赖（仅本适配器需要）：pip install -r crawler/requirements.txt
合规：HTML 采集对改版敏感，务必限速并尊重对方 robots 与服务条款。
"""
from __future__ import annotations

from typing import Any

from ..models import build_play
from .base import Adapter

DEFAULT_UA = "Mozilla/5.0 (luhub crawler)"


class HtmlExampleAdapter(Adapter):
    name = "html_example"
    rate_limit_ms = 1000

    def __init__(self, base_url: str, **opts: Any) -> None:
        if not base_url:
            raise ValueError("html 适配器需要 --base-url 站点地址")
        self.base_url = base_url.rstrip("/")

    @classmethod
    def from_cli(cls, args: Any) -> "HtmlExampleAdapter":
        return cls(args.base_url)

    def fetch_page(self, page: int, *, hours: int | None = None, **opts: Any) -> dict:
        try:
            import httpx
            from bs4 import BeautifulSoup
        except ImportError as e:  # 仅在真正使用 html 适配器时才需要
            raise SystemExit(
                "HTML 适配器需要 httpx 与 beautifulsoup4：pip install -r crawler/requirements.txt"
            ) from e

        list_url = f"{self.base_url}/list/?page={page}"
        html = httpx.get(
            list_url,
            headers={"User-Agent": DEFAULT_UA},
            timeout=30,
            follow_redirects=True,
        ).text
        soup = BeautifulSoup(html, "html.parser")

        vods: list[dict] = []
        for card in soup.select("CSS-选择器：列表卡片"):  # TODO 按目标站点改写
            title_el = card.select_one("CSS-选择器：标题")  # TODO
            link_el = card.select_one("a")  # TODO
            if not title_el or not link_el:
                continue
            detail_url = link_el.get("href", "")
            vod_id = detail_url  # TODO：从详情页 URL 提取稳定 id
            # 进入详情页解析播放地址（注意限速），再用 build_play 组装：
            play_from, play_url = build_play(
                [("线路1", [("第01集", "https://.../1.m3u8")])]  # TODO
            )
            vods.append(
                {
                    "vod_id": vod_id,
                    "vod_name": title_el.get_text(strip=True),
                    "type_id": 4,  # TODO：映射到资源站分类 id
                    "type_name": "动漫",  # TODO
                    "vod_pic": "",  # TODO
                    "vod_remarks": "",  # TODO
                    "vod_play_from": play_from,
                    "vod_play_url": play_url,
                }
            )

        raise NotImplementedError(
            "HtmlExampleAdapter 是模板：请填入选择器与详情页解析后删除本行。"
        )

        # 填好后返回如下结构（删除上面的 raise 即可启用）：
        # return {
        #     "code": 1,
        #     "page": page,
        #     "pagecount": 1,   # 解析到的总页数；用于翻页终止
        #     "class": [{"type_id": 4, "type_name": "动漫"}],
        #     "list": vods,
        # }
