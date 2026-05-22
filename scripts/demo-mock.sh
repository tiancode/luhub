#!/usr/bin/env bash
# 本地 mock 站点采集 demo（纯测试）：起 mock 服务 -> 采集入库 -> 退出时关服务。
#   用法: pnpm demo:mock   或   bash scripts/demo-mock.sh
#   可选: PORT=8901 PAGES=5 NAME=本地Mock站 bash scripts/demo-mock.sh
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-8900}"
PAGES="${PAGES:-5}"
NAME="${NAME:-本地Mock站}"

python3 -m crawler.mocksite.server --port "$PORT" &
SRV=$!
trap 'kill "$SRV" 2>/dev/null || true' EXIT
sleep 1

pnpm collect:py --adapter=mocksite --base-url="http://127.0.0.1:${PORT}" --name="$NAME" --pages="$PAGES"
