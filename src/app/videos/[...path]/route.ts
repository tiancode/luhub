// 流式返回前台播放时缓存到本地的视频（从 VIDEOS_DIR 直接读，支持 Range：拖动进度必需）。
// 不走 public/ 静态托管，因为运行时新写入的文件不会进 next start 的快照、会 404。
import type { NextRequest } from "next/server";
import { VIDEOS_DIR } from "@/lib/cache/paths";
import { serveMedia, CACHE_REVALIDATE } from "@/lib/media";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  // 缓存视频可能被换源/重试覆盖，用可重校验的缓存策略（非 immutable）。
  return serveMedia(VIDEOS_DIR, path, req, CACHE_REVALIDATE);
}
