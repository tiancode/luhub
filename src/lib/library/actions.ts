"use server";

// 收藏 / 观看历史的写入。公开调用（前台访客即可触发）——无 admin 守卫，但都按 cookie 里的
// 匿名 visitorId 隔离;并校验 videoId 真实存在，杜绝伪造 id 写脏数据。
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ensureVisitorId, getVisitorId } from "@/lib/visitor";

async function videoExists(id: number): Promise<boolean> {
  const v = await prisma.video.findUnique({ where: { id }, select: { id: true } });
  return v !== null;
}

// 收藏/取消收藏，返回操作后的新状态（true=已收藏）。
export async function toggleFavorite(videoId: number): Promise<boolean> {
  const id = Number(videoId);
  if (!Number.isInteger(id) || id <= 0) return false;
  const visitorId = await ensureVisitorId();
  const key = { visitorId_videoId: { visitorId, videoId: id } };

  const existing = await prisma.favorite.findUnique({ where: key, select: { id: true } });
  if (existing) {
    await prisma.favorite.delete({ where: key });
    revalidatePath("/me");
    return false;
  }
  if (!(await videoExists(id))) return false;
  await prisma.favorite.create({ data: { visitorId, videoId: id } });
  revalidatePath("/me");
  return true;
}

export interface HistoryInput {
  videoId: number;
  lineName?: string | null;
  epName?: string | null;
  epIndex?: number;
  position?: number;
  duration?: number | null;
}

// 记录/更新观看进度（每访客每影片一条）。Player 节流后高频调用，故不 revalidate。
export async function recordHistory(input: HistoryInput): Promise<void> {
  const videoId = Number(input.videoId);
  if (!Number.isInteger(videoId) || videoId <= 0) return;

  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const position = Math.max(0, num(input.position));
  const epIndex = Math.max(0, Math.trunc(num(input.epIndex)));
  const duration =
    input.duration != null && Number.isFinite(Number(input.duration)) && Number(input.duration) > 0
      ? Number(input.duration)
      : null;
  const lineName = input.lineName ? String(input.lineName).slice(0, 100) : null;
  const epName = input.epName ? String(input.epName).slice(0, 100) : null;

  const visitorId = await ensureVisitorId();
  if (!(await videoExists(videoId))) return;

  const data = { lineName, epName, epIndex, position, duration };
  await prisma.watchHistory.upsert({
    where: { visitorId_videoId: { visitorId, videoId } },
    create: { visitorId, videoId, ...data },
    update: data,
  });
}

export interface RatingResult {
  mine: number; // 本访客打分（1-5），0=未打分
  avg: number | null; // 本站均分
  count: number; // 打分人数
}

// 访客给影片打分（1-5 星）。每访客每影片一条;打分后重算反范式聚合写回 Video。
export async function rateVideo(videoId: number, score: number): Promise<RatingResult | null> {
  const id = Number(videoId);
  const s = Math.trunc(Number(score));
  if (!Number.isInteger(id) || id <= 0) return null;
  if (!Number.isInteger(s) || s < 1 || s > 5) return null;

  const visitorId = await ensureVisitorId();
  if (!(await videoExists(id))) return null;

  // upsert 打分 + 重算该影片均分/人数,同事务写回,避免并发下聚合漂移。
  const agg = await prisma.$transaction(async (tx) => {
    await tx.rating.upsert({
      where: { visitorId_videoId: { visitorId, videoId: id } },
      create: { visitorId, videoId: id, score: s },
      update: { score: s },
    });
    const a = await tx.rating.aggregate({
      where: { videoId: id },
      _avg: { score: true },
      _count: { _all: true },
    });
    const avg = a._avg.score != null ? Math.round(a._avg.score * 10) / 10 : null;
    const count = a._count._all;
    await tx.video.update({
      where: { id },
      data: { ratingAvg: avg, ratingCount: count },
    });
    return { avg, count };
  });

  revalidatePath(`/vod/${id}`);
  return { mine: s, avg: agg.avg, count: agg.count };
}

export async function removeFavorite(videoId: number): Promise<void> {
  const id = Number(videoId);
  if (!Number.isInteger(id) || id <= 0) return;
  const visitorId = await getVisitorId();
  if (!visitorId) return;
  await prisma.favorite.deleteMany({ where: { visitorId, videoId: id } });
  revalidatePath("/me");
}

export async function removeHistory(videoId: number): Promise<void> {
  const id = Number(videoId);
  if (!Number.isInteger(id) || id <= 0) return;
  const visitorId = await getVisitorId();
  if (!visitorId) return;
  await prisma.watchHistory.deleteMany({ where: { visitorId, videoId: id } });
  revalidatePath("/me");
}

export async function clearHistory(): Promise<void> {
  const visitorId = await getVisitorId();
  if (!visitorId) return;
  await prisma.watchHistory.deleteMany({ where: { visitorId } });
  revalidatePath("/me");
}
