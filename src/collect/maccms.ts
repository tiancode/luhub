import { prisma } from "@/lib/prisma";
import { inferGroup } from "@/lib/constants";
import type { SourceConfig } from "../../config/sources";
import { parsePlay } from "./parse";
import { localizeCover } from "./covers";
import type { MaccmsResponse, MaccmsVod } from "./types";

export { parsePlay };

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v).replace(/-/g, "/"));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 取得（或创建）资源站分类对应的本站分类，返回 categoryId */
async function resolveCategory(
  sourceId: number,
  remoteTypeId: number,
  remoteName: string,
): Promise<number> {
  const existing = await prisma.categoryMap.findUnique({
    where: { sourceId_remoteTypeId: { sourceId, remoteTypeId } },
  });
  if (existing) return existing.categoryId;

  const group = inferGroup(remoteName);
  const slug = `s${sourceId}-t${remoteTypeId}`;
  const category = await prisma.category.create({
    data: { name: remoteName || `分类${remoteTypeId}`, slug, group },
  });
  await prisma.categoryMap.create({
    data: { sourceId, remoteTypeId, remoteName, categoryId: category.id },
  });
  return category.id;
}

async function upsertVideo(sourceId: number, vod: MaccmsVod): Promise<void> {
  const sourceVodId = String(vod.vod_id);
  const remoteTypeId = toInt(vod.type_id);
  const categoryId =
    remoteTypeId !== null
      ? await resolveCategory(sourceId, remoteTypeId, vod.type_name ?? "")
      : null;

  // 封面下载到本地,存站内路径(失败为 null,不存外部链接)
  const pic = await localizeCover(sourceId, sourceVodId, vod.vod_pic);

  const data = {
    name: vod.vod_name ?? "",
    pic,
    remarks: vod.vod_remarks || null,
    year: toInt(vod.vod_year),
    area: vod.vod_area || null,
    lang: vod.vod_lang || null,
    actor: vod.vod_actor || null,
    director: vod.vod_director || null,
    content: vod.vod_content || null,
    score: vod.vod_score ? Number(vod.vod_score) || null : null,
    categoryId,
    releasedAt: toDate(vod.vod_time),
  };

  const video = await prisma.video.upsert({
    where: { sourceId_sourceVodId: { sourceId, sourceVodId } },
    create: { sourceId, sourceVodId, ...data },
    update: data,
  });

  const parsed = parsePlay(vod.vod_play_from, vod.vod_play_url);
  // 重建播放线路（幂等）
  await prisma.playSource.deleteMany({ where: { videoId: video.id } });
  for (const ps of parsed) {
    await prisma.playSource.create({
      data: {
        videoId: video.id,
        fromName: ps.fromName,
        sortOrder: ps.sortOrder,
        episodes: {
          create: ps.episodes.map((e) => ({
            name: e.name,
            url: e.url,
            sortOrder: e.sortOrder,
          })),
        },
      },
    });
  }
}

export interface IngestStats {
  categories: number;
  videos: number;
}

/** 将一份 maccms 响应入库（分类 + 影片），网络采集与离线 fixture 共用 */
export async function ingestResponse(
  sourceId: number,
  resp: MaccmsResponse,
): Promise<IngestStats> {
  let categories = 0;
  for (const c of resp.class ?? []) {
    const tid = toInt(c.type_id);
    if (tid === null) continue;
    await resolveCategory(sourceId, tid, c.type_name);
    categories++;
  }
  let videos = 0;
  for (const vod of resp.list ?? []) {
    await upsertVideo(sourceId, vod);
    videos++;
  }
  return { categories, videos };
}

function buildUrl(apiUrl: string, params: Record<string, string | number>): string {
  const url = new URL(apiUrl);
  url.searchParams.set("at", "json");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

async function fetchMaccms(
  apiUrl: string,
  params: Record<string, string | number>,
): Promise<MaccmsResponse> {
  const target = buildUrl(apiUrl, params);
  const res = await fetch(target, {
    headers: { "User-Agent": "Mozilla/5.0 (luhub collector)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${target}`);
  return (await res.json()) as MaccmsResponse;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface SyncOptions {
  pages?: number; // 采集页数（从第 1 页起）
  hours?: number; // 仅采集最近 h 小时内更新（增量）
  delayMs?: number; // 每页间隔，限速
  onProgress?: (msg: string) => void;
}

export async function syncSource(
  config: SourceConfig,
  opts: SyncOptions = {},
): Promise<IngestStats> {
  const { pages = 5, hours, delayMs = 500, onProgress } = opts;

  const source = await prisma.source.upsert({
    where: { name: config.name },
    create: { name: config.name, apiUrl: config.apiUrl, kind: config.kind },
    update: { apiUrl: config.apiUrl, kind: config.kind },
  });

  const total: IngestStats = { categories: 0, videos: 0 };
  let pageCount = pages;

  for (let pg = 1; pg <= pageCount; pg++) {
    const params: Record<string, string | number> = { ac: "detail", pg };
    if (hours) params.h = hours;
    const resp = await fetchMaccms(config.apiUrl, params);

    if (typeof resp.pagecount === "number") {
      pageCount = Math.min(pages, resp.pagecount);
    }
    const stats = await ingestResponse(source.id, resp);
    total.categories += stats.categories;
    total.videos += stats.videos;
    onProgress?.(
      `  page ${pg}/${pageCount}: +${stats.videos} videos (${stats.categories} cats)`,
    );

    if (pg < pageCount && delayMs > 0) await sleep(delayMs);
  }

  await prisma.source.update({
    where: { id: source.id },
    data: { lastSyncAt: new Date() },
  });

  return total;
}
