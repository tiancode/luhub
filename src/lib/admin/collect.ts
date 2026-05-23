// 采集编排:把 DB Source 行桥接到采集引擎,并把结果写入 CollectRun。
// maccms 源走 TS 原生 syncSource;html 源若设置了 Python 适配器(如 yhdm)则走 syncViaPython
// (流式边抓边入库 + 断点续采)。注意:本文件不是 "use server",由 actions 在 after() 回调中调用。
import { prisma } from "@/lib/prisma";
import { syncSource } from "@/collect/maccms";
import { syncViaPython } from "@/collect/python";
import { beginRun, endRun } from "./runControl";
import type { SourceConfig, SourceKind } from "../../../config/sources";

const LOG_TAIL = 300; // 实时日志只保留最近 N 行,避免 CollectRun.message 过大

export interface CollectOptions {
  pages?: number;
  hours?: number;
  full?: boolean;
}

export interface SourceSnapshot {
  id: number;
  name: string;
  apiUrl: string;
  kind: string;
  adapter: string | null;
  enabled: boolean;
}

export function dbSourceToConfig(s: SourceSnapshot): SourceConfig {
  return {
    name: s.name,
    apiUrl: s.apiUrl,
    kind: s.kind as SourceKind,
    enabled: s.enabled,
  };
}

/** 执行一次采集,全程把进度/结果写入指定 CollectRun。绝不抛出(错误写入记录)。 */
export async function runCollect(
  runId: number,
  source: SourceSnapshot,
  opts: CollectOptions,
  startPage = 1,
): Promise<void> {
  // 「采集全部」队列里若某条在轮到前已被暂停(状态被改),直接跳过。
  const cur = await prisma.collectRun.findUnique({
    where: { id: runId },
    select: { status: true, videos: true, categories: true },
  });
  if (cur && cur.status !== "running") return;
  // 续采时已有计数,本次统计累加其上(新建运行此处为 0,不受影响)。
  const baseVideos = cur?.videos ?? 0;
  const baseCategories = cur?.categories ?? 0;

  const signal = beginRun(runId);
  const pages = opts.full ? 99999 : opts.pages ?? 5;
  const hours = opts.full ? undefined : opts.hours;
  // 每页完整入库后落库进度,供暂停后从 lastPage+1 续采(maccms);失败忽略。
  const onPage = (pg: number) => {
    prisma.collectRun.update({ where: { id: runId }, data: { lastPage: pg } }).catch(() => {});
  };

  const log: string[] = [];
  const tail = () => log.slice(-LOG_TAIL).join("\n");
  // 每行打时间戳:卡住时能看出“多久没动静”,区分“慢”和“真卡死”。
  const stamp = (m: string) => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `[${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}] ${m}`;
  };
  let lastFlush = 0;
  const onProgress = (m: string) => {
    log.push(stamp(m));
    if (log.length > LOG_TAIL * 2) log.splice(0, log.length - LOG_TAIL); // 限制内存
    const now = Date.now();
    if (now - lastFlush > 1000) {
      lastFlush = now;
      // 节流写库,便于前台轮询实时看到日志;忽略偶发写冲突。
      prisma.collectRun
        .update({ where: { id: runId }, data: { message: tail() } })
        .catch(() => {});
    }
  };

  try {
    // html 源必须配置 Python 适配器,否则会被错误地当作 maccms 接口去 fetch 而失败。
    if (source.kind === "html" && !source.adapter) {
      throw new Error(
        "html 源未配置 Python 适配器(如 yhdm):请在「编辑」里填写「Python 适配器」后再采集",
      );
    }
    // html 源 + 已配置 Python 适配器 -> 走流式 Python 采集(边抓边入库 + 断点续采)
    const usePython = source.kind === "html" && !!source.adapter;
    const stats = usePython
      ? await syncViaPython(
          source.id,
          { adapter: source.adapter as string, baseUrl: source.apiUrl, pages, hours, signal },
          onProgress,
        )
      : await syncSource(dbSourceToConfig(source), {
          pages,
          hours,
          delayMs: 500,
          onProgress,
          signal,
          startPage,
          onPage,
        });

    // 暂停:syncSource/syncViaPython 在 abort 时优雅返回已采集的部分统计。
    const paused = signal.aborted;
    if (paused) log.push(stamp("— 已暂停;已采集的已入库,再次「开始采集」可续采。"));
    await prisma.collectRun.update({
      where: { id: runId },
      data: {
        status: paused ? "paused" : "success",
        videos: baseVideos + stats.videos,
        categories: baseCategories + stats.categories,
        finishedAt: new Date(),
        message: tail() || null,
      },
    });

    // 采集到新视频后，若空闲预缓存循环此前已停止（库已全缓存），重新点燃；失败不影响采集。
    try {
      const { tickIdleCache, idleCacheEnabled } = await import("@/lib/cache/idle");
      if (idleCacheEnabled()) void tickIdleCache();
    } catch (e) {
      console.error("[cache] 采集后触发空闲预缓存失败:", e);
    }
  } catch (e) {
    await prisma.collectRun.update({
      where: { id: runId },
      data: {
        status: "failed",
        finishedAt: new Date(),
        message: [...log.slice(-LOG_TAIL), stamp(`错误: ${(e as Error).message}`)].join(
          "\n",
        ),
      },
    });
  } finally {
    endRun(runId);
  }
}
