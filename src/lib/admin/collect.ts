// 采集编排：把 DB Source 行桥接到现有采集引擎 syncSource，并把结果写入 CollectRun。
// 注意：本文件不是 "use server"，由 actions 在 after() 回调中调用。
import { prisma } from "@/lib/prisma";
import { syncSource } from "@/collect/maccms";
import type { SourceConfig, SourceKind } from "../../../config/sources";

export interface CollectOptions {
  pages?: number;
  hours?: number;
  full?: boolean;
}

export interface SourceSnapshot {
  name: string;
  apiUrl: string;
  kind: string;
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

/** 执行一次采集，全程把进度/结果写入指定 CollectRun。绝不抛出（错误写入记录）。 */
export async function runCollect(
  runId: number,
  source: SourceSnapshot,
  opts: CollectOptions,
): Promise<void> {
  const pages = opts.full ? 99999 : opts.pages ?? 5;
  const hours = opts.full ? undefined : opts.hours;

  const log: string[] = [];
  let lastFlush = 0;

  try {
    const stats = await syncSource(dbSourceToConfig(source), {
      pages,
      hours,
      delayMs: 500,
      onProgress: (m) => {
        log.push(m);
        const now = Date.now();
        if (now - lastFlush > 2000) {
          lastFlush = now;
          // 节流写库，便于前台轮询看到进度；忽略偶发写冲突。
          prisma.collectRun
            .update({ where: { id: runId }, data: { message: log.join("\n") } })
            .catch(() => {});
        }
      },
    });
    await prisma.collectRun.update({
      where: { id: runId },
      data: {
        status: "success",
        videos: stats.videos,
        categories: stats.categories,
        finishedAt: new Date(),
        message: log.join("\n") || null,
      },
    });
  } catch (e) {
    await prisma.collectRun.update({
      where: { id: runId },
      data: {
        status: "failed",
        finishedAt: new Date(),
        message: [...log, `错误: ${(e as Error).message}`].join("\n"),
      },
    });
  }
}
