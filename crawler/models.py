"""maccms 形状的小工具。"""
from __future__ import annotations

from typing import Sequence


def build_play(lines: Sequence[tuple[str, Sequence[tuple[str, str]]]]) -> tuple[str, str]:
    """把结构化线路转成 maccms 的 (vod_play_from, vod_play_url)。

    入参 lines: [(线路名, [(集名, 播放地址), ...]), ...]
    返回 (vod_play_from, vod_play_url)，与 src/collect/parse.ts 的解析互逆：
      - 多条线路用 ``$$$`` 分隔，from 与 url 一一对应
      - 每条线路内多集用 ``#`` 分隔，每集为 ``名称$地址``
    """
    froms = "$$$".join(name for name, _ in lines)
    urls = "$$$".join(
        "#".join(f"{ep}${url}" for ep, url in eps) for _, eps in lines
    )
    return froms, urls
