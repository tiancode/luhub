"""CLI 入口：运行某个适配器，把每条 maccms 响应作为一行 JSON(NDJSON)流式打印到 stdout。

用法示例：
  python -m crawler.run --adapter maccms --api https://站点/api.php/provide/vod/ --pages 3
  python -m crawler.run --adapter yhdm --pages 50 --seen-file /tmp/seen.txt

输出（stdout）：**NDJSON** —— 每行一份 maccms 形状响应(适配器可逐页或逐部产出)，
每产出一条即写一行并 flush，供 TS 的 ingestResponse 边收边入库；中途中断时，
已写出的行已落库，不会全部丢失。诊断信息一律走 stderr，避免污染 stdout 的 JSON。
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
    p.add_argument(
        "--seen-file",
        dest="seen_file",
        help="已采集 vod_id 列表文件(每行一个);断点续采时跳过这些 id,不再抓取其详情页",
    )
    return p


def _load_seen(path: str | None) -> list[str] | None:
    if not path:
        return None
    try:
        with open(path, encoding="utf-8") as f:
            return [line.strip() for line in f if line.strip()]
    except OSError as e:
        print(f"读取 seen-file 失败({path}): {e}", file=sys.stderr)
        return None


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    adapter = ADAPTERS[args.adapter].from_cli(args)

    crawl_kwargs: dict = {"pages": args.pages, "hours": args.hours}
    seen = _load_seen(getattr(args, "seen_file", None))
    if seen is not None:
        crawl_kwargs["seen_ids"] = seen

    # 流式 NDJSON:每产出一条结果即写一行并 flush，便于 TS 边收边入库。
    for resp in adapter.crawl(**crawl_kwargs):
        sys.stdout.write(json.dumps(resp, ensure_ascii=False))
        sys.stdout.write("\n")
        sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
