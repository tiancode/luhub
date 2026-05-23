// 把远端剧集落到本地：mp4 直链流式下载；m3u8 经 ffmpeg 无损合并成单个 mp4。
// 均「先写 .tmp 再 rename」，避免崩溃留下半文件。
// 两道超时：STALL_MS（一段时间没有任何数据/进度就判定为坏流，快速放弃）+ TIMEOUT_MS（总上限）。
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { rename, rm, stat } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

const UA = "Mozilla/5.0 (luhub video cacher)";
const TIMEOUT_MS = Number(process.env.VIDEO_CACHE_TIMEOUT_MS) || 30 * 60_000;
// 无数据/无进度判定为坏流的阈值（也覆盖「连不上」：连接迟迟不返回数据同样会触发）。
const STALL_MS = Number(process.env.VIDEO_CACHE_STALL_MS) || 60_000;
// ffmpeg 的 I/O 停滞由其自身 -rw_timeout(=STALL_MS) 处理；我们的看门狗放宽到 3 倍，
// 仅作真正卡死(非 I/O)的兜底，避免把慢但仍在工作的合并误杀。
const FFMPEG_STALL_MS = STALL_MS * 3;
const FFMPEG_BIN = process.env.FFMPEG_BIN || "ffmpeg";

// 流式下载 mp4 直链到 absFile，返回字节数。卡住（STALL_MS 无数据）或超总时长即中止并抛错。
export async function downloadMp4(url: string, absFile: string): Promise<number> {
  const tmp = `${absFile}.tmp`;
  const ctrl = new AbortController();
  let reason: string | null = null;
  let lastTick = Date.now();
  const abort = (why: string) => {
    reason = why;
    ctrl.abort();
  };
  const hardTimer = setTimeout(() => abort(`总超时（${TIMEOUT_MS}ms）`), TIMEOUT_MS);
  const stallTimer = setInterval(() => {
    if (Date.now() - lastTick > STALL_MS) abort(`数据停滞超过 ${STALL_MS}ms`);
  }, Math.min(STALL_MS, 5_000));
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    // PassThrough 监控进度（不抢数据：透传同时刷新 lastTick），保留背压。
    const monitor = new Transform({
      transform(chunk, _enc, cb) {
        lastTick = Date.now();
        cb(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(res.body as WebReadableStream<Uint8Array>),
      monitor,
      createWriteStream(tmp),
    );
    const { size } = await stat(tmp);
    if (size === 0) throw new Error("空响应");
    await rename(tmp, absFile);
    return size;
  } catch (e) {
    await rm(tmp, { force: true }).catch(() => {});
    throw new Error(reason ?? (e as Error).message);
  } finally {
    clearTimeout(hardTimer);
    clearInterval(stallTimer);
  }
}

// 用 ffmpeg -c copy 把 m3u8 无损合并成单个 mp4，返回字节数。
export async function remuxHls(url: string, absFile: string): Promise<number> {
  const tmp = `${absFile}.tmp.mp4`;
  const args = [
    "-y",
    "-user_agent", UA,
    "-rw_timeout", String(STALL_MS * 1000), // ffmpeg 自身 I/O 超时（微秒），坏流早退
    // 限制协议白名单（不含 file），防止恶意 m3u8 用 file:// 读取本地文件并混进输出。
    "-protocol_whitelist", "http,https,tcp,tls,crypto,data",
    "-i", url,
    "-c", "copy",
    "-bsf:a", "aac_adtstoasc", // ADTS(AAC) -> MP4 容器所需
    "-movflags", "+faststart", // moov 前置，便于边下边播/拖动
    tmp,
  ];
  try {
    await runFfmpeg(args);
    const { size } = await stat(tmp);
    if (size === 0) throw new Error("ffmpeg 产出空文件");
    await rename(tmp, absFile);
    return size;
  } catch (e) {
    await rm(tmp, { force: true }).catch(() => {});
    throw e;
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let lastTick = Date.now();
    let killReason: string | null = null;
    const kill = (why: string) => {
      killReason = why;
      proc.kill("SIGKILL");
    };
    const hardTimer = setTimeout(() => kill(`总超时（${TIMEOUT_MS}ms）`), TIMEOUT_MS);
    const stallTimer = setInterval(() => {
      if (Date.now() - lastTick > FFMPEG_STALL_MS) kill(`无进度超过 ${FFMPEG_STALL_MS}ms`);
    }, Math.min(FFMPEG_STALL_MS, 5_000));
    const clear = () => {
      clearTimeout(hardTimer);
      clearInterval(stallTimer);
    };
    // ffmpeg 进度走 stderr：有输出即视为仍在工作。只留尾部，避免长任务爆内存。
    proc.stderr.on("data", (d: Buffer) => {
      lastTick = Date.now();
      stderr = (stderr + d.toString()).slice(-4000);
    });
    proc.on("error", (err) => {
      clear();
      reject(new Error(`无法启动 ffmpeg（${FFMPEG_BIN}）：${err.message}`));
    });
    proc.on("close", (code) => {
      clear();
      if (killReason) reject(new Error(`ffmpeg 中止：${killReason}`));
      else if (code === 0) resolve();
      else reject(new Error(`ffmpeg 退出码 ${code}：${stderr.trim().split("\n").slice(-3).join(" ")}`));
    });
  });
}
