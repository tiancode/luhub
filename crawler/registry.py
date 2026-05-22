"""适配器注册表：名称 -> 适配器类。新增适配器在此登记即可被 CLI 调用。"""
from __future__ import annotations

from .adapters.base import Adapter
from .adapters.html_example import HtmlExampleAdapter
from .adapters.maccms import MaccmsAdapter
from .adapters.mocksite import MockSiteAdapter

ADAPTERS: dict[str, type[Adapter]] = {
    MaccmsAdapter.name: MaccmsAdapter,
    HtmlExampleAdapter.name: HtmlExampleAdapter,
    MockSiteAdapter.name: MockSiteAdapter,
}
