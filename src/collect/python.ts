// 桥接 Python 采集器：spawn `python -m crawler.run`，把它输出的 maccms 形状 JSON
// 交给现有 ingestResponse 入库。Python 只负责抓取+解析，写库逻辑仍只在 TS 一处。
import { spawn } from "node:child_process";
import { ingestResponse, type IngestStats } from "./maccms";
import type { MaccmsResponse } from "./types";

export interface PythonCrawlOptions {
  adapter: string; // crawler/registry.py 中登记的适配器名，如 "maccms" | "html_example"
  api?: string; // maccms 接口地址
  baseUrl?: string; // html 站点根地址
  pages?: number;
  hours?: number;
  delayMs?: number;
  python?: string; // python 可执行文件，默认 env PYTHON_BIN 或 "python3"
  cwd?: string; // 运行目录，默认 process.cwd()（需含 crawler/ 包）
}

/** 运行 Python 采集器，解析其 stdout 为各页 maccms 响应数组。 */
export function runPythonCrawler(
  opts: PythonCrawlOptions,
): Promise<MaccmsResponse[]> {
  const args = ["-m", "crawler.run", "--adapter", opts.adapter];
  if (opts.api) args.push("--api", opts.api);
  if (opts.baseUrl) args.push("--base-url", opts.baseUrl);
  if (opts.pages != null) args.push("--pages", String(opts.pages));
  if (opts.hours != null) args.push("--hours", String(opts.hours));
  if (opts.delayMs != null) args.push("--delay-ms", String(opts.delayMs));

  const py = opts.python ?? process.env.PYTHON_BIN ?? "python3";

  return new Promise((resolve, reject) => {
    const child = spawn(py, args, { cwd: opts.cwd ?? process.cwd() });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`python 采集器退出码 ${code}：${err.trim()}`));
        return;
      }
      try {
        resolve(JSON.parse(out) as MaccmsResponse[]);
      } catch (e) {
        reject(
          new Error(
            `解析 python 输出失败：${(e as Error).message}${err.trim() ? `；stderr=${err.trim()}` : ""}`,
          ),
        );
      }
    });
  });
}

/** 经 Python 采集器抓取后，逐页 ingestResponse 入库。 */
export async function syncViaPython(
  sourceId: number,
  opts: PythonCrawlOptions,
  onProgress?: (msg: string) => void,
): Promise<IngestStats> {
  const pages = await runPythonCrawler(opts);
  const total: IngestStats = { categories: 0, videos: 0 };
  for (let i = 0; i < pages.length; i++) {
    const stats = await ingestResponse(sourceId, pages[i]);
    total.categories += stats.categories;
    total.videos += stats.videos;
    onProgress?.(
      `  page ${i + 1}/${pages.length}: +${stats.videos} videos (${stats.categories} cats)`,
    );
  }
  return total;
}
