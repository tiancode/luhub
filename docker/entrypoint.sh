#!/bin/sh
set -e

# 首启/每次启动：把待应用的迁移落到挂载卷上的 SQLite（幂等）。
echo "[luhub] prisma migrate deploy ..."
pnpm prisma migrate deploy

# 可选：设 SEED=1 时灌入离线示例数据（首次预览用，之后去掉该变量）。
if [ "${SEED:-0}" = "1" ]; then
  echo "[luhub] seeding sample data ..."
  pnpm db:seed || echo "[luhub] seed skipped/failed (ignored)"
fi

echo "[luhub] starting: $*"
exec "$@"
