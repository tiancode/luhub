// 空闲自动缓存：缓存队列空闲时，随机挑一集还没缓存的入队下载，充分利用空闲时间。
// 「一集一份」：每个视频每一集（按 epName，跨线路）全站只缓存一份。
import { prisma } from "@/lib/prisma";
import { MAX_ATTEMPTS, prepareEpisodeCache } from "./store";
import { enqueueCacheJob, isCacheQueueIdle } from "./cache";

// 空闲预缓存默认开启；仅 DISABLE_IDLE_CACHE=1（或全局 DISABLE_VIDEO_CACHE=1）时关闭。
export function idleCacheEnabled(): boolean {
  return process.env.DISABLE_VIDEO_CACHE !== "1" && process.env.DISABLE_IDLE_CACHE !== "1";
}

export interface IdleCandidate {
  videoId: number;
  epName: string;
  lineName: string;
  url: string;
  sortOrder: number;
}

interface RawRow {
  videoId: number | bigint;
  epName: string;
  lineName: string;
  url: string;
  sortOrder: number | bigint;
}

// 随机挑一条「该集（跨线路）尚无在用缓存、且该线路未彻底失败」的剧集；无可缓存返回 null。
export async function selectNextIdleEpisode(): Promise<IdleCandidate | null> {
  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT v.id AS videoId, e.name AS epName, ps.fromName AS lineName,
           e.url AS url, e.sortOrder AS sortOrder
    FROM Episode e
    JOIN PlaySource ps ON ps.id = e.playSourceId
    JOIN Video v       ON v.id = ps.videoId
    WHERE e.url LIKE 'http%'
      AND NOT EXISTS (
        SELECT 1 FROM CachedEpisode c
        WHERE c.videoId = v.id AND c.epName = e.name
          AND c.status IN ('ready', 'downloading', 'pending'))
      AND NOT EXISTS (
        SELECT 1 FROM CachedEpisode c2
        WHERE c2.videoId = v.id AND c2.lineName = ps.fromName AND c2.epName = e.name
          AND c2.status = 'failed' AND c2.attempts >= ${MAX_ATTEMPTS} AND c2.sourceUrl = e.url)
    ORDER BY RANDOM()
    LIMIT 1`;
  const r = rows[0];
  if (!r) return null;
  return {
    videoId: Number(r.videoId),
    epName: r.epName,
    lineName: r.lineName,
    url: r.url,
    sortOrder: Number(r.sortOrder),
  };
}

// 防并发重入：启动点燃与 drain 钩子可能同时触发，避免重复挑选/入队。
let ticking = false;

// 空闲时挑一集入队；任务排空后由 cache.ts 的 drain 钩子再次触发 → 自维持循环。
// 全部缓存完则 selectNextIdleEpisode 返回 null，循环自然停止；
// 采集完成 / 用户播放 / 进程重启会重新点燃。
export async function tickIdleCache(): Promise<void> {
  if (!idleCacheEnabled()) return;
  if (ticking) return;
  ticking = true;
  try {
    if (!isCacheQueueIdle()) return;
    const c = await selectNextIdleEpisode();
    if (!c) return;
    // await 期间可能有用户播放触发的任务入队，再确认一次空闲，避免抢占用户任务。
    if (!isCacheQueueIdle()) return;
    const id = await prepareEpisodeCache(c);
    if (id != null) enqueueCacheJob(id);
  } catch (e) {
    console.error("[cache] 空闲预缓存挑选失败:", e);
  } finally {
    ticking = false;
  }
}
