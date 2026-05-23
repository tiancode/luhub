// 缓存去重/入库的共享逻辑：播放触发(actions.ts)与空闲预缓存(idle.ts)共用，保证语义一致。
import { prisma } from "@/lib/prisma";
import { isHls } from "./paths";

// 失败重试上限；坏流连续失败到此数后不再尝试下载，直接跳过。
export const MAX_ATTEMPTS = Math.max(1, Number(process.env.VIDEO_CACHE_MAX_ATTEMPTS) || 3);

// 「一集一份」：某视频的某集（按 epName，跨线路）是否已有在用的缓存（ready/downloading/pending）。
export async function hasActiveEpisodeCopy(videoId: number, epName: string): Promise<boolean> {
  const hit = await prisma.cachedEpisode.findFirst({
    where: { videoId, epName, status: { in: ["ready", "downloading", "pending"] } },
    select: { id: true },
  });
  return hit !== null;
}

export interface PrepareInput {
  videoId: number;
  lineName: string;
  epName: string;
  url: string;
  sortOrder: number;
}

// 去重 + 失败判定 + upsert 为 pending。返回待入队的 row.id；应跳过时返回 null。
// 不自行入队——由调用方决定 after()（请求上下文）还是直接 enqueueCacheJob。
export async function prepareEpisodeCache(input: PrepareInput): Promise<number | null> {
  if (process.env.DISABLE_VIDEO_CACHE === "1") return null;
  const { videoId, lineName, epName, url, sortOrder } = input;
  if (!Number.isInteger(videoId) || videoId <= 0) return null;
  if (!lineName || !epName) return null;
  if (!/^https?:\/\//i.test(url)) return null;

  // 一集一份：该集已在任一线路缓存/在途 → 跳过（含本线路已 pending/downloading 的去重）。
  if (await hasActiveEpisodeCopy(videoId, epName)) return null;

  const format = isHls(url) ? "hls" : "mp4";
  const key = { videoId_lineName_epName: { videoId, lineName, epName } };
  const existing = await prisma.cachedEpisode.findUnique({ where: key });
  // 该集没有在途副本（上面已判），这里只判本线路自身的坏流：
  // 连续失败已达上限且地址未变 → 跳过；地址变了给新地址一轮完整重试。
  if (
    existing?.status === "failed" &&
    existing.attempts >= MAX_ATTEMPTS &&
    existing.sourceUrl === url
  ) {
    return null;
  }

  // 地址变了（源站换了链接）→ 重置失败计数，给新地址一轮完整重试。
  const urlChanged = !existing || existing.sourceUrl !== url;
  const row = await prisma.cachedEpisode.upsert({
    where: key,
    create: { videoId, lineName, epName, sourceUrl: url, status: "pending", format, sortOrder },
    update: {
      sourceUrl: url,
      status: "pending",
      format,
      sortOrder,
      error: null,
      ...(urlChanged ? { attempts: 0 } : {}),
    },
  });
  return row.id;
}
