// 流式返回采集下载到本地的封面（从 COVERS_DIR 直接读，支持 Range）。
// 不走 public/ 静态托管，因为运行时新写入的文件不会进 next start 的快照、会 404。
import type { NextRequest } from "next/server";
import { COVERS_DIR } from "@/collect/covers";
import { serveMedia } from "@/lib/media";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return serveMedia(COVERS_DIR, path, req);
}
