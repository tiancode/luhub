// 运行时生成的媒体文件（封面、缓存视频）的服务端流式响应。
// 不能依赖 Next 的 public/ 静态托管：next start 只服务启动时已存在的快照，
// 运行时新写入的文件会 404；且 public/ 内软链到卷外会被安全检查拒绝。
// 故由路由处理器在请求时直接从存储目录读取，并支持 Range（视频拖动必需）。
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { Readable } from "node:stream";

// 封面按文件名幂等、永不覆盖 → 可长期 immutable。
export const CACHE_IMMUTABLE = "public, max-age=31536000, immutable";
// 缓存视频在换源/重试时会覆盖同一路径 → 不能 immutable，需可重校验（配合 Last-Modified / 304）。
export const CACHE_REVALIDATE = "public, max-age=86400";

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".m3u8": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t",
};

function contentType(p: string): string {
  return TYPES[extname(p).toLowerCase()] ?? "application/octet-stream";
}

// 在 baseDir 下安全解析请求路径，拒绝越界（防目录穿越）。返回绝对路径或 null。
function resolveSafe(baseDir: string, segments: string[]): string | null {
  for (const s of segments) {
    if (!s || s === "." || s === ".." || s.includes("/") || s.includes("\\") || s.includes("\0")) {
      return null;
    }
  }
  const abs = normalize(join(baseDir, ...segments));
  const root = normalize(baseDir.endsWith(sep) ? baseDir : baseDir + sep);
  return abs.startsWith(root) ? abs : null;
}

function toWeb(stream: Readable): ReadableStream<Uint8Array> {
  return Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;
}

// segments 为已 URL 解码的路径段（Next 动态路由参数）。
export async function serveMedia(
  baseDir: string,
  segments: string[],
  req: Request,
  cacheControl: string = CACHE_IMMUTABLE,
): Promise<Response> {
  const abs = resolveSafe(baseDir, segments);
  if (!abs) return new Response("Bad path", { status: 400 });

  let info;
  try {
    info = await stat(abs);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!info.isFile()) return new Response("Not found", { status: 404 });

  const size = info.size;
  const lastModified = info.mtime.toUTCString();
  const headers: Record<string, string> = {
    "Content-Type": contentType(abs),
    "Accept-Ranges": "bytes",
    "Cache-Control": cacheControl,
    "Last-Modified": lastModified,
  };

  const range = req.headers.get("range");

  // 条件请求（仅非 Range）：文件未变则 304，避免重复传整个大文件。
  if (!range) {
    const since = Date.parse(req.headers.get("if-modified-since") ?? "");
    if (!Number.isNaN(since) && Math.floor(info.mtimeMs / 1000) * 1000 <= since) {
      return new Response(null, {
        status: 304,
        headers: { "Cache-Control": cacheControl, "Last-Modified": lastModified },
      });
    }
  }

  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m && (m[1] || m[2])) {
      let start: number;
      let end: number;
      if (m[1] === "") {
        // 后缀范围 bytes=-N：取最后 N 字节
        start = Math.max(0, size - parseInt(m[2], 10));
        end = size - 1;
      } else {
        start = parseInt(m[1], 10);
        end = m[2] ? parseInt(m[2], 10) : size - 1;
      }
      end = Math.min(end, size - 1);
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
        return new Response("Range Not Satisfiable", {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      }
      return new Response(toWeb(createReadStream(abs, { start, end })), {
        status: 206,
        headers: {
          ...headers,
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Content-Length": String(end - start + 1),
        },
      });
    }
  }

  return new Response(toWeb(createReadStream(abs)), {
    status: 200,
    headers: { ...headers, "Content-Length": String(size) },
  });
}
