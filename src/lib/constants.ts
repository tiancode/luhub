export type GroupKey = "movie" | "tv" | "variety" | "anime" | "other";

export const GROUPS: { key: GroupKey; label: string }[] = [
  { key: "movie", label: "电影" },
  { key: "tv", label: "电视剧" },
  { key: "variety", label: "综艺" },
  { key: "anime", label: "动漫" },
];

export const GROUP_LABELS: Record<string, string> = Object.fromEntries(
  GROUPS.map((g) => [g.key, g.label]),
);

/// 根据资源站分类名推断本站分组
export function inferGroup(typeName: string): GroupKey {
  const n = typeName ?? "";
  if (/动漫|动画|番剧|国创|漫画/.test(n)) return "anime";
  if (/综艺|综/.test(n)) return "variety";
  if (/剧|电视/.test(n)) return "tv";
  if (/电影|影片|片/.test(n)) return "movie";
  return "other";
}

export const SITE_NAME = "LuHub 影视";
