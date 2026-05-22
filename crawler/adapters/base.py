"""采集适配器基类。"""
from __future__ import annotations

import time
from abc import ABC, abstractmethod
from typing import Any, Iterator


class Adapter(ABC):
    """采集适配器基类。

    子类只需实现 :meth:`fetch_page`，把一页结果归一化为 maccms 形状的 dict：
    ``{code, msg, page, pagecount, class:[...], list:[...]}``。
    :meth:`crawl` 负责翻页 + 限速，无需子类关心。
    """

    name: str = "base"
    rate_limit_ms: int = 500

    @abstractmethod
    def fetch_page(self, page: int, *, hours: int | None = None, **opts: Any) -> dict:
        """抓取并解析单页，返回一个 maccms 形状的 dict。"""
        raise NotImplementedError

    @classmethod
    def from_cli(cls, args: Any) -> "Adapter":
        """从 argparse 命名空间构造实例（各子类实现）。"""
        raise NotImplementedError(f"{cls.__name__} 未实现 from_cli")

    def crawl(
        self, *, pages: int = 5, hours: int | None = None, **opts: Any
    ) -> Iterator[dict]:
        """按页迭代，受 ``pagecount`` 与 ``rate_limit_ms`` 约束。"""
        page_count = pages
        pg = 1
        while pg <= page_count:
            resp = self.fetch_page(pg, hours=hours, **opts)
            pc = resp.get("pagecount")
            try:
                pc = int(pc)  # 容错：有些站把 pagecount 返回成字符串
            except (TypeError, ValueError):
                pc = None
            if pc and pc > 0:
                page_count = min(pages, pc)
            yield resp
            pg += 1
            if pg <= page_count and self.rate_limit_ms > 0:
                time.sleep(self.rate_limit_ms / 1000)
