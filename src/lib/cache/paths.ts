// 缓存视频的本地路径/对外 URL 规则（纯函数，便于单测）。
import { join } from "node:path";

// 缓存视频根目录。默认 public/videos（Next 静态目录，直接以 /videos/<...> 提供）。
// 可用 VIDEOS_DIR 覆盖；但站内 URL 固定为 /videos/<...>，故覆盖路径需被映射到该 URL
// （Docker 把数据卷软链到 <app>/public/videos，见 docker/entrypoint.sh）。
export const VIDEOS_DIR = process.env.VIDEOS_DIR || join(process.cwd(), "public", "videos");
export const PUBLIC_BASE = "/videos";

export const isHls = (url: string) => /\.m3u8(\?|#|$)/i.test(url);

// 文件系统非法字符（Windows + Unix）：/ \ : * ? " < > |
const ILLEGAL = /[/\\:*?"<>|]/g;

// 把单个路径片段清洗成文件系统安全、但仍可读的名字：
// - 非法字符 → 空格
// - 折叠空白；去首尾空白与点（避免 "." ".." 与隐藏文件、防目录穿越）
// - 空则回退占位
export function sanitizeSegment(s: string, fallback = "未命名"): string {
  const cleaned = (s ?? "")
    .replace(ILLEGAL, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .trim();
  return cleaned || fallback;
}

export interface EpisodePathInput {
  groupLabel: string; // 分类组中文名，如 "电视剧"
  name: string; // 片名
  year?: number | null;
  lineName: string; // 线路名
  epName: string; // 集数名
}

export interface EpisodePath {
  absDir: string;
  absFile: string;
  relPath: string; // 分类/片名 (年份)/线路/集数.mp4（人类可读）
  localUrl: string; // /videos/<分段 encodeURIComponent>（中文路径需 encode，Next 静态托管会解码匹配）
}

// 产物始终是 .mp4：分类组 / 片名 (年份) / 线路 / 集数.mp4
export function buildEpisodePath(input: EpisodePathInput): EpisodePath {
  const group = sanitizeSegment(input.groupLabel, "未分类");
  const title = sanitizeSegment(
    input.year ? `${input.name} (${input.year})` : input.name,
    "未命名",
  );
  const line = sanitizeSegment(input.lineName, "线路");
  const file = `${sanitizeSegment(input.epName, "未命名")}.mp4`;

  const segments = [group, title, line, file];
  const absDir = join(VIDEOS_DIR, group, title, line);
  return {
    absDir,
    absFile: join(absDir, file),
    relPath: segments.join("/"),
    localUrl: `${PUBLIC_BASE}/${segments.map(encodeURIComponent).join("/")}`,
  };
}
