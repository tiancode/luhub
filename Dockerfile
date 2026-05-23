# syntax=docker/dockerfile:1
# 单镜像：Next.js 网站 + Python 爬虫。SQLite 放挂载卷 /data（持久化）。

# ---------- base ----------
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

# ---------- deps（含原生模块编译兜底：better-sqlite3）----------
FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY prisma ./prisma
RUN npx prisma generate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---------- build ----------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 构建期不接真实库；给个临时可写路径，避免任何模块在 build 时尝试打开 /data。
ENV DATABASE_URL="file:/tmp/luhub-build.db"
RUN pnpm build

# ---------- runner ----------
FROM base AS runner
ENV NODE_ENV=production
ENV DATABASE_URL="file:/data/dev.db"
ENV PORT=3000
# python3 跑 crawler/；tini 处理信号；ffmpeg 把 m3u8 合并成 mp4（前台播放即缓存用）；
# 安装 crawler 依赖（html/mocksite 适配器用，maccms 不需要）
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip ca-certificates tini ffmpeg \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app ./
RUN pip3 install --break-system-packages --no-cache-dir -r crawler/requirements.txt
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
EXPOSE 3000
VOLUME ["/data"]
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["pnpm", "start"]
