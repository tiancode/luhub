"""CLI 入口：运行某个适配器，把各页 maccms 响应作为 JSON 数组打印到 stdout。

用法示例：
  python -m crawler.run --adapter maccms --api https://站点/api.php/provide/vod/ --pages 3
  python -m crawler.run --adapter html_example --base-url https://站点 --pages 2

输出（stdout）：JSON 数组，每个元素是一页 maccms 形状响应，供 TS 的 ingestResponse 逐页入库。
诊断信息一律走 stderr，避免污染 stdout 的 JSON。
"""
from __future__ import annotations

import argparse
import json
import sys

from .registry import ADAPTERS


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="python -m crawler.run",
        description="LuHub 采集器：抓取+解析，输出 maccms 形状 JSON 到 stdout。",
    )
    p.add_argument("--adapter", required=True, choices=sorted(ADAPTERS), help="适配器名")
    p.add_argument("--api", help="maccms 接口地址（maccms 适配器用）")
    p.add_argument("--base-url", dest="base_url", help="站点根地址（html 适配器用）")
    p.add_argument("--pages", type=int, default=5, help="采集页数（默认 5）")
    p.add_argument("--hours", type=int, help="仅最近 H 小时更新（增量）")
    p.add_argument(
        "--delay-ms", dest="delay_ms", type=int, default=500, help="每页间隔毫秒（限速）"
    )
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    adapter = ADAPTERS[args.adapter].from_cli(args)
    pages = list(adapter.crawl(pages=args.pages, hours=args.hours))
    json.dump(pages, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
