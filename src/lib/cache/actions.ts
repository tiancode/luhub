"use server";

// 前台播放某集时触发后台缓存。公开调用（无 admin 守卫——前台访客即可触发）。
// 防滥用：DB 去重（一集一份 + 已 ready/downloading/pending 跳过）+ 进程内串行队列 + DISABLE_VIDEO_CACHE 兜底。
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueCacheJob } from "./cache";
import { prepareEpisodeCache } from "./store";

export interface CacheRequest {
  videoId: number;
  lineName: string;
  epName: string;
}

export async function requestEpisodeCache(req: CacheRequest): Promise<void> {
  if (process.env.DISABLE_VIDEO_CACHE === "1") return;

  const videoId = Number(req.videoId);
  const lineName = (req.lineName ?? "").trim();
  const epName = (req.epName ?? "").trim();
  if (!Number.isInteger(videoId) || videoId <= 0) return;
  if (!lineName || !epName) return;

  // 不信客户端给的地址：按 (videoId, 线路名, 集名) 在库里查真实剧集地址，
  // 杜绝伪造 url 触发 SSRF / 任意下载；顺带拿到正确的 sortOrder。
  const episode = await prisma.episode.findFirst({
    where: { name: epName, playSource: { videoId, fromName: lineName } },
    select: { url: true, sortOrder: true },
  });
  if (!episode || !/^https?:\/\//i.test(episode.url)) return;

  const id = await prepareEpisodeCache({
    videoId,
    lineName,
    epName,
    url: episode.url,
    sortOrder: episode.sortOrder,
  });

  // 响应返回后再排队执行下载，不阻塞播放请求。
  if (id != null) after(() => enqueueCacheJob(id));
}
