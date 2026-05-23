// 采集编排:把 DB Source 行桥接到采集引擎,并把结果写入 CollectRun。
// maccms 源走 TS 原生 syncSource;html 源若设置了 Python 适配器(如 yhdm)则走 syncViaPython
// (流式边抓边入库 + 断点续采)。注意:本文件不是 "use server",由 actions 在 after() 回调中调用。
import { prisma } from "@/lib/prisma";
import { syncSource } from "@/collect/maccms";
import { syncViaPython } from "@/collect/python";
import type { SourceConfig, SourceKind } from "../../../config/sources";

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
): Promise<void> {
  const pages = opts.full ? 99999 : opts.pages ?? 5;
  const hours = opts.full ? undefined : opts.hours;

  const log: string[] = [];
  let lastFlush = 0;
  const onProgress = (m: string) => {
    log.push(m);
    const now = Date.now();
    if (now - lastFlush > 2000) {
      lastFlush = now;
      // 节流写库,便于前台轮询看到进度;忽略偶发写冲突。
      prisma.collectRun
        .update({ where: { id: runId }, data: { message: log.join("\n") } })
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
          { adapter: source.adapter as string, baseUrl: source.apiUrl, pages, hours },
          onProgress,
        )
      : await syncSource(dbSourceToConfig(source), { pages, hours, delayMs: 500, onProgress });

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
