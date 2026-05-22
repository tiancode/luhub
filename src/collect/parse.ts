import type { ParsedPlaySource } from "./types";

/**
 * 解析 maccms 的 vod_play_from / vod_play_url。
 * - 多条线路用 `$$$` 分隔，from 与 url 一一对应
 * - 每条线路内多集用 `#` 分隔
 * - 每集为 `名称$地址`
 */
export function parsePlay(
  playFrom: string | undefined,
  playUrl: string | undefined,
): ParsedPlaySource[] {
  if (!playUrl) return [];
  const froms = (playFrom ?? "").split("$$$");
  const groups = playUrl.split("$$$");

  return groups
    .map((group, i) => {
      const fromName = (froms[i] ?? "").trim() || `线路${i + 1}`;
      const episodes = group
        .split("#")
        .map((seg, j) => {
          const sep = seg.indexOf("$");
          let name: string;
          let url: string;
          if (sep === -1) {
            name = `第${j + 1}集`;
            url = seg.trim();
          } else {
            name = seg.slice(0, sep).trim() || `第${j + 1}集`;
            url = seg.slice(sep + 1).trim();
          }
          return { name, url, sortOrder: j };
        })
        .filter((e) => /^https?:\/\//i.test(e.url));
      return { fromName, sortOrder: i, episodes };
    })
    .filter((s) => s.episodes.length > 0);
}
