"""通用 maccms V10 采集适配器（仅用 Python 标准库，零依赖）。

对任意符合 maccms V10 的 provide/vod 接口可用——接口本身已是 maccms 形状，
本适配器只负责取 JSON 并原样透传给上层。
"""
from __future__ import annotations

import json
import urllib.parse
import urllib.request
from typing import Any

from .base import Adapter

DEFAULT_UA = "Mozilla/5.0 (luhub crawler)"


class MaccmsAdapter(Adapter):
    name = "maccms"

    def __init__(
        self,
        api_url: str,
        *,
        rate_limit_ms: int = 500,
        user_agent: str = DEFAULT_UA,
    ) -> None:
        if not api_url:
            raise ValueError("maccms 适配器需要 --api 接口地址")
        self.api_url = api_url
        self.rate_limit_ms = rate_limit_ms
        self.user_agent = user_agent

    @classmethod
    def from_cli(cls, args: Any) -> "MaccmsAdapter":
        return cls(args.api, rate_limit_ms=args.delay_ms)

    def fetch_page(self, page: int, *, hours: int | None = None, **opts: Any) -> dict:
        parsed = urllib.parse.urlparse(self.api_url)
        query = dict(urllib.parse.parse_qsl(parsed.query))
        query.update({"at": "json", "ac": "detail", "pg": str(page)})
        if hours:
            query["h"] = str(hours)
        url = parsed._replace(query=urllib.parse.urlencode(query)).geturl()

        req = urllib.request.Request(url, headers={"User-Agent": self.user_agent})
        # 地址由部署者在后台/CLI 自行配置，属受信任输入。
        with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310
            payload = resp.read()
        return json.loads(payload.decode("utf-8", "replace"))
