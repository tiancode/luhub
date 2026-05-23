// Next 启动钩子（register 在服务进程启动时跑一次，nodejs 运行时）。
// 缓存任务的队列是进程内内存态，容器/进程重启会清空，但 DB 里的行仍停在
// pending/downloading。这里在启动时把中断的任务复位并重新入队，避免它们永久卡住
// （否则用户重播会被 requestEpisodeCache 的去重逻辑跳过，永远缓存不出来）。
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DISABLE_VIDEO_CACHE === "1") return;
  try {
    const { prisma } = await import("@/lib/prisma");
    const { enqueueCacheJob } = await import("@/lib/cache/cache");
    // 上次中断时停在 downloading 的，复位为 pending（其残留 .tmp 会在重跑时被覆盖）。
    await prisma.cachedEpisode.updateMany({
      where: { status: "downloading" },
      data: { status: "pending" },
    });
    const pending = await prisma.cachedEpisode.findMany({
      where: { status: "pending" },
      select: { id: true },
    });
    for (const r of pending) enqueueCacheJob(r.id);
    if (pending.length) console.log(`[cache] 启动恢复 ${pending.length} 个未完成缓存任务`);
  } catch (e) {
    console.error("[cache] 启动恢复未完成任务失败:", e);
  }
}
