// 把远端封面下载到本地,避免前端依赖外部链接(防盗链/失效/隐私)。
// 在唯一写库入口 upsertVideo 里调用:成功 -> 存站内路径 /covers/<file>;失败 -> null(不存外部链接)。
import { mkdir, access, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";

// 默认存到 public/covers(Next 静态目录,直接以 /covers/<file> 提供)。
// 可用 COVERS_DIR 覆盖;但站内 URL 固定为 /covers/<file>,故覆盖路径需被映射到该 URL
// (例如 Docker 把数据卷挂到 <app>/public/covers,详见 docs/deploy.md)。
const COVERS_DIR = process.env.COVERS_DIR || join(process.cwd(), "public", "covers");
const PUBLIC_BASE = "/covers";
const UA = "Mozilla/5.0 (luhub cover fetcher)";
const TIMEOUT_MS = 10_000;

function pickExt(url: string): string {
  try {
    const m = new URL(url).pathname.match(/\.(jpe?g|png|webp|gif|avif|bmp)$/i);
    if (!m) return "jpg";
    return m[1].toLowerCase() === "jpeg" ? "jpg" : m[1].toLowerCase();
  } catch {
    return "jpg";
  }
}

const safeId = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "_");

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * 下载封面到本地,返回站内 URL(/covers/...);无地址/失败返回 null。
 * - 幂等:同 (sourceId, sourceVodId) 文件已存在则直接复用,不重复下载。
 * - 已是站内路径(以 / 开头)原样返回。
 * - 设 DISABLE_COVER_DOWNLOAD=1 时跳过下载、原样返回远端地址(供离线 seed / 特殊场景)。
 */
export async function localizeCover(
  sourceId: number,
  sourceVodId: string,
  remoteUrl: string | null | undefined,
): Promise<string | null> {
  const url = (remoteUrl ?? "").trim();
  if (!url) return null;
  if (url.startsWith("/")) return url; // 已是站内路径
  if (process.env.DISABLE_COVER_DOWNLOAD === "1") return url;

  const name = `${sourceId}-${safeId(sourceVodId)}.${pickExt(url)}`;
  const dest = join(COVERS_DIR, name);
  const publicPath = `${PUBLIC_BASE}/${name}`;

  if (await exists(dest)) return publicPath; // 幂等复用

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) throw new Error("空响应");
    await mkdir(COVERS_DIR, { recursive: true });
    // 先写临时文件再 rename,避免崩溃时留下半张图。
    const tmp = `${dest}.tmp`;
    await writeFile(tmp, buf);
    await rename(tmp, dest);
    return publicPath;
  } catch (e) {
    // 不回退到外部链接;下次采集(文件仍不存在)会自动重试。
    console.error(`封面下载失败 ${url}: ${(e as Error).message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
