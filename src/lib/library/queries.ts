// 个人「片库」查询：收藏 + 观看历史，按匿名 visitorId 维度读。仅服务端调用。
import { prisma } from "@/lib/prisma";
import type { VideoCardData } from "@/components/VideoCard";

const cardSelect = {
  id: true,
  name: true,
  pic: true,
  remarks: true,
  year: true,
  area: true,
} satisfies import("@/generated/prisma/client").Prisma.VideoSelect;

export async function getFavorites(visitorId: string): Promise<VideoCardData[]> {
  const rows = await prisma.favorite.findMany({
    where: { visitorId },
    orderBy: { createdAt: "desc" },
    select: { video: { select: cardSelect } },
  });
  return rows.map((r) => r.video);
}

export async function isFavorited(visitorId: string, videoId: number): Promise<boolean> {
  const hit = await prisma.favorite.findUnique({
    where: { visitorId_videoId: { visitorId, videoId } },
    select: { id: true },
  });
  return hit !== null;
}

export interface HistoryItem {
  video: VideoCardData;
  lineName: string | null;
  epName: string | null;
  epIndex: number;
  position: number;
  duration: number | null;
  updatedAt: Date;
}

export async function getHistory(visitorId: string, limit = 60): Promise<HistoryItem[]> {
  return prisma.watchHistory.findMany({
    where: { visitorId },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      lineName: true,
      epName: true,
      epIndex: true,
      position: true,
      duration: true,
      updatedAt: true,
      video: { select: cardSelect },
    },
  });
}

export interface ResumeInfo {
  lineName: string | null;
  epName: string | null;
  epIndex: number;
  position: number;
}

// 某影片对该访客的续播点；无历史返回 null。供 vod 页定位初始线路/集/进度。
export async function getResume(visitorId: string, videoId: number): Promise<ResumeInfo | null> {
  return prisma.watchHistory.findUnique({
    where: { visitorId_videoId: { visitorId, videoId } },
    select: { lineName: true, epName: true, epIndex: true, position: true },
  });
}
