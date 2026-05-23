// 后台缓存任务：进程内串行队列 + 单个任务执行。
import { mkdir } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { GROUP_LABELS } from "@/lib/constants";
import { buildEpisodePath, isHls } from "./paths";
import { downloadMp4, remuxHls } from "./download";

const MAX = Math.max(1, Number(process.env.VIDEO_CACHE_CONCURRENCY) || 1);
let active = 0;
const queue: { id: number; resolve: () => void }[] = [];
const inFlight = new Map<number, Promise<void>>();

// 队列是否完全空闲（无在执行/排队/在途任务）。空闲预缓存据此判断该不该挑下一集。
export function isCacheQueueIdle(): boolean {
  return active === 0 && queue.length === 0 && inFlight.size === 0;
}

// 队列排空时的回调（由 instrumentation 注册为空闲预缓存的 tick）。
// 用「注册」而非直接 import idle 模块，避免 cache ↔ idle 的循环依赖。
let onDrain: (() => void) | null = null;
export function setDrainHook(fn: (() => void) | null): void {
  onDrain = fn;
}

// 把缓存任务排入队列（默认并发 1，尊重 SQLite 单写、避免打爆源站/ffmpeg）。
// 同一 id 正在排队/执行则复用同一 promise（去重）。返回的 promise 在该任务完成后 resolve。
export function enqueueCacheJob(id: number): Promise<void> {
  const existing = inFlight.get(id);
  if (existing) return existing;
  const p = new Promise<void>((resolve) => queue.push({ id, resolve }));
  inFlight.set(id, p);
  pump();
  return p;
}

function pump(): void {
  while (active < MAX && queue.length > 0) {
    const { id, resolve } = queue.shift()!;
    active++;
    runCacheJob(id)
      .catch((e) => console.error(`[cache] 任务 ${id} 异常:`, e))
      .finally(() => {
        active--;
        inFlight.delete(id);
        resolve();
        pump();
        // 队列彻底排空 → 触发空闲预缓存挑下一集（自维持循环）。
        if (onDrain && isCacheQueueIdle()) {
          try {
            onDrain();
          } catch (e) {
            console.error("[cache] drain 钩子异常:", e);
          }
        }
      });
  }
}

// 缓存下载用的 Referer：优先用源站显式配置的 referer，否则回退用 apiUrl 的站点域名（多数防盗链按此校验）。
function refererFor(source: { referer: string | null; apiUrl: string } | null): string | undefined {
  if (!source) return undefined;
  if (source.referer?.trim()) return source.referer.trim();
  try {
    const u = new URL(source.apiUrl);
    return `${u.protocol}//${u.host}/`;
  } catch {
    return undefined;
  }
}

async function runCacheJob(id: number): Promise<void> {
  const row = await prisma.cachedEpisode.findUnique({
    where: { id },
    include: { video: { include: { category: true, source: true } } },
  });
  if (!row || row.status === "ready") return;

  const groupLabel = row.video.category
    ? GROUP_LABELS[row.video.category.group] ?? row.video.category.name
    : "未分类";
  const { absDir, absFile, relPath, localUrl } = buildEpisodePath({
    videoId: row.videoId,
    groupLabel,
    name: row.video.name,
    year: row.video.year,
    lineName: row.lineName,
    epName: row.epName,
  });

  await prisma.cachedEpisode.update({
    where: { id },
    data: { status: "downloading", error: null },
  });

  try {
    await mkdir(absDir, { recursive: true });
    const referer = refererFor(row.video.source);
    const hls = isHls(row.sourceUrl);
    const bytes = hls
      ? await remuxHls(row.sourceUrl, absFile, referer)
      : await downloadMp4(row.sourceUrl, absFile, referer);
    await prisma.cachedEpisode.update({
      where: { id },
      data: {
        status: "ready",
        format: hls ? "hls" : "mp4",
        localUrl,
        relPath,
        bytes: BigInt(bytes),
        error: null,
      },
    });
  } catch (e) {
    // 失败累加 attempts；requestEpisodeCache 会据此跳过反复失败的坏流。
    await prisma.cachedEpisode.update({
      where: { id },
      data: {
        status: "failed",
        error: (e as Error).message.slice(0, 500),
        attempts: { increment: 1 },
      },
    });
  }
}
