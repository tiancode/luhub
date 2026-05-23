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

// 单次请求超时(毫秒),可经环境变量调。没有它,死服务器会让采集无限挂起。
const FETCH_TIMEOUT_MS = Number(process.env.COLLECT_FETCH_TIMEOUT_MS) || 30_000;

async function fetchMaccms(
  apiUrl: string,
  params: Record<string, string | number>,
  signal?: AbortSignal,
): Promise<MaccmsResponse> {
  const target = buildUrl(apiUrl, params);
  // 暂停信号 + 超时信号合并:任一触发即中断 fetch(含读 body,防止 body 永不结束)。
  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const merged = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let res: Response;
  try {
    res = await fetch(target, {
      headers: { "User-Agent": "Mozilla/5.0 (luhub collector)" },
      signal: merged,
    });
  } catch (e) {
    // 超时单独报错(区别于用户暂停:用户暂停时外层据 signal.aborted 静默处理)。
    if (timeout.aborted && !signal?.aborted) {
      throw new Error(`请求超时(${FETCH_TIMEOUT_MS}ms):${target}`);
    }
    throw e;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${target}`);
  return (await res.json()) as MaccmsResponse;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface SyncOptions {
  pages?: number; // 采集到第几页为止（绝对页码）
  hours?: number; // 仅采集最近 h 小时内更新（增量）
  delayMs?: number; // 每页间隔，限速
  onProgress?: (msg: string) => void;
  signal?: AbortSignal; // 暂停信号：置位后在页间停止（已入库的保留）
  startPage?: number; // 从第几页开始（暂停后续采），默认 1
  onPage?: (page: number) => void; // 每页完整入库后回调（用于持久化进度）
}

export async function syncSource(
  config: SourceConfig,
  opts: SyncOptions = {},
): Promise<IngestStats> {
  const { pages = 5, hours, delayMs = 500, onProgress, signal, startPage = 1, onPage } = opts;

  const source = await prisma.source.upsert({
    where: { name: config.name },
    create: { name: config.name, apiUrl: config.apiUrl, kind: config.kind },
    update: { apiUrl: config.apiUrl, kind: config.kind },
  });

  const total: IngestStats = { categories: 0, videos: 0 };
  let pageCount = pages;

  for (let pg = startPage; pg <= pageCount; pg++) {
    if (signal?.aborted) break; // 暂停:页间停止,已入库的保留
    const params: Record<string, string | number> = { ac: "detail", pg };
    if (hours) params.h = hours;
    let resp: MaccmsResponse;
    try {
      onProgress?.(`抓取第 ${pg}/${pageCount} 页…`);
      resp = await fetchMaccms(config.apiUrl, params, signal);
    } catch (e) {
      if (signal?.aborted) break; // 在途请求被 abort 打断:按暂停处理
      throw e;
    }

    if (typeof resp.pagecount === "number") {
      pageCount = Math.min(pages, resp.pagecount);
    }
    const stats = await ingestResponse(source.id, resp);
    total.categories += stats.categories;
    total.videos += stats.videos;
    onPage?.(pg); // 该页已完整入库,记录进度供续采
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
