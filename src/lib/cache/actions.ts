"use server";

// 前台播放某集时触发后台缓存。公开调用（无 admin 守卫——前台访客即可触发）。
// 防滥用：DB 去重（已 ready/downloading/pending 跳过）+ 进程内串行队列 + DISABLE_VIDEO_CACHE 兜底。
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { isHls } from "./paths";
import { enqueueCacheJob } from "./cache";

// 失败重试上限；坏流连续失败到此数后不再尝试下载，直接跳过。
const MAX_ATTEMPTS = Math.max(1, Number(process.env.VIDEO_CACHE_MAX_ATTEMPTS) || 3);

export interface CacheRequest {
  videoId: number;
  lineName: string;
  epName: string;
  url: string;
}

export async function requestEpisodeCache(req: CacheRequest): Promise<void> {
  if (process.env.DISABLE_VIDEO_CACHE === "1") return;

  const videoId = Number(req.videoId);
  const lineName = (req.lineName ?? "").trim();
  const epName = (req.epName ?? "").trim();
  const url = (req.url ?? "").trim();
  if (!Number.isInteger(videoId) || videoId <= 0) return;
  if (!lineName || !epName) return;
  if (!/^https?:\/\//i.test(url)) return; // 只缓存远程地址；本地 /videos/... 不回缓

  // 确认影片存在，避免外部伪造 videoId 触发 FK 异常。
  const video = await prisma.video.findUnique({ where: { id: videoId }, select: { id: true } });
  if (!video) return;

  const key = { videoId_lineName_epName: { videoId, lineName, epName } };
  const existing = await prisma.cachedEpisode.findUnique({ where: key });
  if (existing) {
    // 去重：已完成或在途
    if (
      existing.status === "ready" ||
      existing.status === "downloading" ||
      existing.status === "pending"
    ) {
      return;
    }
    // 坏流：连续失败已达上限，跳过不再下载（除非地址变了，给新地址一次机会）
    if (
      existing.status === "failed" &&
      existing.attempts >= MAX_ATTEMPTS &&
      existing.sourceUrl === url
    ) {
      return;
    }
  }

  const format = isHls(url) ? "hls" : "mp4";
  // 地址变了（源站换了链接）→ 重置失败计数，给新地址一轮完整重试。
  const urlChanged = !existing || existing.sourceUrl !== url;
  const row = await prisma.cachedEpisode.upsert({
    where: key,
    create: { videoId, lineName, epName, sourceUrl: url, status: "pending", format },
    update: {
      sourceUrl: url,
      status: "pending",
      format,
      error: null,
      ...(urlChanged ? { attempts: 0 } : {}),
    },
  });

  // 响应返回后再排队执行下载，不阻塞播放请求。
  after(() => enqueueCacheJob(row.id));
}
