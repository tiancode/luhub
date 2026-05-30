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

/** 这些分组的剧集默认倒序展示（最新一集在前），如番剧/动漫。 */
const REVERSE_EPISODE_GROUPS: ReadonlySet<GroupKey> = new Set(["anime"]);

/** 该分组是否倒序展示剧集。分组排序策略集中在此，调用点不再硬编码分组名。 */
export function groupReversesEpisodes(group?: string | null): boolean {
  return group != null && REVERSE_EPISODE_GROUPS.has(group as GroupKey);
}

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
