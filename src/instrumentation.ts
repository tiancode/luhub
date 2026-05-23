// Next 启动钩子（register 在服务进程启动时跑一次，nodejs 运行时）。
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { prisma } = await import("@/lib/prisma");

  // SQLite 并发：busy_timeout 让并发写自动重试，避免采集与缓存任务同时写库时偶发
  // SQLITE_BUSY。不开 WAL —— 数据卷可能在 Unraid /mnt/user(FUSE) 上，WAL 依赖共享内存
  // mmap，在这类文件系统上不可靠。better-sqlite3 单连接，设一次即生效。
  try {
    await prisma.$executeRawUnsafe("PRAGMA busy_timeout=5000");
  } catch (e) {
    console.error("[db] 设置 busy_timeout 失败:", e);
  }

  // 缓存任务队列是进程内内存态，重启会清空，但 DB 行仍停在 pending/downloading。
  // 启动时把中断的任务复位并重新入队，避免它们永久卡住（否则用户重播会被去重跳过）。
  if (process.env.DISABLE_VIDEO_CACHE === "1") return;
  try {
    const { enqueueCacheJob } = await import("@/lib/cache/cache");
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
