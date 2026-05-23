#!/bin/sh
set -e

# 首启/每次启动：把待应用的迁移落到挂载卷上的 SQLite（幂等）。
echo "[luhub] prisma migrate deploy ..."
pnpm prisma migrate deploy

# 封面与缓存视频持久化：直接落在挂载卷上（COVERS_DIR=/data/covers、VIDEOS_DIR=/data/videos，
# 见 Dockerfile），由路由处理器 /covers、/videos 流式返回，不再软链进 public/。
# 随 DB 一起持久（记得纳入备份）；视频体积大，注意磁盘策略。
mkdir -p /data/covers /data/videos

# 可选：设 SEED=1 时灌入离线示例数据（首次预览用，之后去掉该变量）。
if [ "${SEED:-0}" = "1" ]; then
  echo "[luhub] seeding sample data ..."
  pnpm db:seed || echo "[luhub] seed skipped/failed (ignored)"
fi

echo "[luhub] starting: $*"
exec "$@"
