// 桥接 Python 采集器:spawn `python -m crawler.run`,把它逐行输出的 maccms 形状
// JSON(NDJSON)**边收边交给 ingestResponse 入库**。Python 只负责抓取+解析,写库逻辑仍只在 TS。
//
// 设计要点:
// - 流式:Python 每抓到一条资源就打一行 JSON,TS 收到即入库 —— 中途断开时已抓部分已落库。
// - 断点续采:入库前先把该源已采集的 sourceVodId 写入临时文件,经 --seen-file 传给 Python;
//   Python 跳过这些 id,不再请求其详情页。增量(hours)模式不跳过,以便刷新已有番的新集。
// - 串行入库:逐行排队 await,避免并发写 SQLite(单写)。
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { ingestResponse, type IngestStats } from "./maccms";
import type { MaccmsResponse } from "./types";

export interface PythonCrawlOptions {
  adapter: string; // crawler/registry.py 中登记的适配器名,如 "maccms" | "yhdm"
  api?: string; // maccms 接口地址
  baseUrl?: string; // html 站点根地址
  pages?: number;
  hours?: number;
  delayMs?: number;
  python?: string; // python 可执行文件,默认 env PYTHON_BIN 或 "python3"
  cwd?: string; // 运行目录,默认 process.cwd()(需含 crawler/ 包)
  resume?: boolean; // 默认 true:跳过该源已采集的 vod_id(断点续采);增量(hours)模式自动不跳过
}

function buildArgs(opts: PythonCrawlOptions, seenFile?: string): string[] {
  const args = ["-m", "crawler.run", "--adapter", opts.adapter];
  if (opts.api) args.push("--api", opts.api);
  if (opts.baseUrl) args.push("--base-url", opts.baseUrl);
  if (opts.pages != null) args.push("--pages", String(opts.pages));
  if (opts.hours != null) args.push("--hours", String(opts.hours));
  if (opts.delayMs != null) args.push("--delay-ms", String(opts.delayMs));
  if (seenFile) args.push("--seen-file", seenFile);
  return args;
}

/**
 * 运行 Python 采集器并“边收边入库”:逐行解析 stdout 的 NDJSON,每行一份 maccms 响应,
 * 立即 ingestResponse,返回累计统计。若 Python 退出码非 0 会抛错,但此前已逐行入库的
 * 数据均已落库(断点续采友好);下次运行会自动跳过这些已采集的 vod_id。
 */
export async function syncViaPython(
  sourceId: number,
  opts: PythonCrawlOptions,
  onProgress?: (msg: string) => void,
): Promise<IngestStats> {
  // 断点续采:把该源已入库的 sourceVodId + 更新备注指纹(id<TAB>备注)传给 Python。
  // Python 据此跳过“已采集且备注未变”的项,只重抓备注变化(集数更新)的项。
  // 增量(hours)模式不跳过,以便刷新最近更新。
  let tmpDir: string | undefined;
  let seenFile: string | undefined;
  const wantResume = opts.resume !== false && opts.hours == null;
  if (wantResume) {
    // 只把“已有播放线路”的影片计入已采集;此前抓取失败(0 线路)的项不跳过,留待重抓。
    const rows = await prisma.video.findMany({
      where: { sourceId, playSources: { some: {} } },
      select: { sourceVodId: true, remarks: true },
    });
    if (rows.length > 0) {
      tmpDir = await mkdtemp(join(tmpdir(), "luhub-seen-"));
      seenFile = join(tmpDir, "seen.txt");
      const lines = rows.map(
        (r) => `${r.sourceVodId}\t${(r.remarks ?? "").replace(/\s+/g, " ").trim()}`,
      );
      await writeFile(seenFile, lines.join("\n"), "utf8");
      onProgress?.(`断点续采:已采集 ${rows.length} 个,仅重抓有更新的`);
    }
  }

  const py = opts.python ?? process.env.PYTHON_BIN ?? "python3";
  const args = buildArgs(opts, seenFile);
  const total: IngestStats = { categories: 0, videos: 0 };

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(py, args, { cwd: opts.cwd ?? process.cwd() });
      // stderr 仅用于失败时的错误信息,只保留尾部,避免长时间采集时无限增长。
      const STDERR_CAP = 64 * 1024;
      let err = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (d) => {
        err += d;
        if (err.length > STDERR_CAP) err = err.slice(-STDERR_CAP);
      });

      // 逐行入库,串行排队避免并发写 SQLite。
      const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
      let chain: Promise<void> = Promise.resolve();
      let fatal: Error | null = null;

      rl.on("line", (line) => {
        const s = line.trim();
        if (!s) return;
        chain = chain
          .then(async () => {
            if (fatal) return;
            let resp: MaccmsResponse;
            try {
              resp = JSON.parse(s) as MaccmsResponse;
            } catch (e) {
              // stdout 只应有 JSON 行(诊断走 stderr);坏行跳过不致命。
              console.error(`跳过无法解析的输出行:${(e as Error).message}`);
              return;
            }
            const stats = await ingestResponse(sourceId, resp);
            total.categories += stats.categories;
            total.videos += stats.videos;
            for (const v of resp.list ?? []) {
              onProgress?.(`  +入库 ${v.vod_name || v.vod_id}`);
            }
          })
          .catch((e) => {
            fatal = e as Error;
            // 入库出错:无意义再让爬虫继续(可能还要数小时),立即终止子进程,尽快结算。
            child.kill();
          });
      });

      child.on("error", reject);
      child.on("close", (code) => {
        // 等待入库队列排空后再结算。
        chain
          .then(() => {
            if (fatal) reject(fatal);
            else if (code !== 0)
              reject(new Error(`python 采集器退出码 ${code}:${err.trim()}`));
            else resolve();
          })
          .catch(reject);
      });
    });
  } finally {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  return total;
}
