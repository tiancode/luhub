// 空闲自动缓存：缓存队列空闲时，随机挑一集还没缓存的入队下载，充分利用空闲时间。
// 「一集一份」：每个视频每一集（按 epName，跨线路）全站只缓存一份。
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { MAX_ATTEMPTS, prepareEpisodeCache } from "./store";
import { enqueueCacheJob, isCacheQueueIdle } from "./cache";

// 空闲预缓存默认开启；仅 DISABLE_IDLE_CACHE=1（或全局 DISABLE_VIDEO_CACHE=1）时关闭。
export function idleCacheEnabled(): boolean {
  return process.env.DISABLE_VIDEO_CACHE !== "1" && process.env.DISABLE_IDLE_CACHE !== "1";
}

// 每轮空闲预缓存之间的最小间隔：给坏流的「秒失败」节流，避免空转打爆 CPU/DB。
const IDLE_DELAY_MS = Math.max(0, Number(process.env.VIDEO_CACHE_IDLE_DELAY_MS) || 1000);
// 先随机抽几个视频在其内部找未缓存的集，命不中再精确兜底（避免对整库连表 ORDER BY RANDOM() 全扫）。
const RANDOM_VIDEO_TRIES = 5;
// 选到却被 prepareEpisodeCache 拒绝（竞态/边缘 url）时，换候选再试的次数。
const PREPARE_TRIES = 5;

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

function toCandidate(r: RawRow | undefined): IdleCandidate | null {
  if (!r) return null;
  return {
    videoId: Number(r.videoId),
    epName: r.epName,
    lineName: r.lineName,
    url: r.url,
    sortOrder: Number(r.sortOrder),
  };
}

// 一条「该集（跨线路）尚无在用缓存、且该线路未彻底失败」的剧集；可加视频过滤。
// 排序优先「失败次数最少」的线路：同一集里没试过的线路(=0)永远排在试过失败的前面，
// 于是每集先把各线路各试一遍、任一条能下即胜出，坏流不会插队反复重试。
function selectSql(videoFilter: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`
    SELECT v.id AS videoId, e.name AS epName, ps.fromName AS lineName,
           e.url AS url, e.sortOrder AS sortOrder
    FROM Episode e
    JOIN PlaySource ps ON ps.id = e.playSourceId
    JOIN Video v       ON v.id = ps.videoId
    -- 该线路在当前地址上的失败计数（无记录视为 0）：据此优先未试过的线路。
    LEFT JOIN CachedEpisode c3
      ON c3.videoId = v.id AND c3.lineName = ps.fromName
         AND c3.epName = e.name AND c3.sourceUrl = e.url
    WHERE (e.url LIKE 'http://%' OR e.url LIKE 'https://%')
      ${videoFilter}
      AND NOT EXISTS (
        SELECT 1 FROM CachedEpisode c
        WHERE c.videoId = v.id AND c.epName = e.name
          AND c.status IN ('ready', 'downloading', 'pending'))
      AND NOT EXISTS (
        SELECT 1 FROM CachedEpisode c2
        WHERE c2.videoId = v.id AND c2.lineName = ps.fromName AND c2.epName = e.name
          AND c2.status = 'failed' AND c2.attempts >= ${MAX_ATTEMPTS} AND c2.sourceUrl = e.url)
    ORDER BY COALESCE(c3.attempts, 0) ASC, RANDOM()
    LIMIT 1`;
}

// 随机挑一条待缓存剧集；无可缓存返回 null。
// 先随机抽视频、在视频内找（命中即 O(单视频集数)），多次未命中再整库精确兜底（保证不漏最后几集）。
export async function selectNextIdleEpisode(): Promise<IdleCandidate | null> {
  for (let i = 0; i < RANDOM_VIDEO_TRIES; i++) {
    const v = await prisma.$queryRaw<{ id: number | bigint }[]>`
      SELECT id FROM Video ORDER BY RANDOM() LIMIT 1`;
    if (!v[0]) return null; // 库里没有视频
    const rows = await prisma.$queryRaw<RawRow[]>(selectSql(Prisma.sql`AND v.id = ${Number(v[0].id)}`));
    const c = toCandidate(rows[0]);
    if (c) return c;
  }
  // 兜底：多数视频已缓存完时随机难命中，精确扫一遍，保证循环不早停。
  const rows = await prisma.$queryRaw<RawRow[]>(selectSql(Prisma.empty));
  return toCandidate(rows[0]);
}

// 防并发重入与重复定时：启动点燃、drain 钩子、采集完成可能同时来。
let ticking = false;
let scheduled = false;

// 延迟一拍后再 tick：drain 钩子与采集完成走这里，给整个自维持循环统一节流。
export function scheduleIdleTick(): void {
  if (!idleCacheEnabled() || scheduled) return;
  scheduled = true;
  const t = setTimeout(() => {
    scheduled = false;
    void tickIdleCache();
  }, IDLE_DELAY_MS);
  t.unref?.();
}

// 空闲时挑一集入队；任务排空后由 cache.ts 的 drain 钩子（经 scheduleIdleTick）再次触发 → 自维持循环。
// 全部缓存完则 selectNextIdleEpisode 返回 null，循环自然停止；采集完成 / 用户播放 / 进程重启会重新点燃。
export async function tickIdleCache(): Promise<void> {
  if (!idleCacheEnabled()) return;
  if (ticking) return;
  ticking = true;
  try {
    if (!isCacheQueueIdle()) return;
    for (let i = 0; i < PREPARE_TRIES; i++) {
      const c = await selectNextIdleEpisode();
      if (!c) return; // 全部缓存完，循环自然停止
      // await 期间可能有用户播放触发的任务入队，再确认一次空闲，避免抢占用户任务。
      if (!isCacheQueueIdle()) return;
      const id = await prepareEpisodeCache(c);
      if (id != null) {
        enqueueCacheJob(id); // 完成后 drain 钩子会再次（延迟）触发，自维持
        return;
      }
      // 选到却被拒绝（竞态/边缘 url）→ 换条候选再试，别让循环直接死掉。
    }
    // 连续多次「选到却没入队」→ 延迟后重试，保证仍有未缓存集时循环不早停。
    scheduleIdleTick();
  } catch (e) {
    console.error("[cache] 空闲预缓存挑选失败:", e);
  } finally {
    ticking = false;
  }
}
