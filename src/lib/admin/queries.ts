// 采集后台只读查询助手（Server Component 中直接调用）。
import { prisma } from "@/lib/prisma";

export async function getDashboard() {
  const [sourceCount, enabledCount, videoCount, categoryCount, sources] =
    await Promise.all([
      prisma.source.count(),
      prisma.source.count({ where: { enabled: true } }),
      prisma.video.count(),
      prisma.category.count(),
      prisma.source.findMany({
        orderBy: { id: "asc" },
        include: {
          collectRuns: { orderBy: { startedAt: "desc" }, take: 1 },
          _count: { select: { videos: true } },
        },
      }),
    ]);
  return { sourceCount, enabledCount, videoCount, categoryCount, sources };
}

export async function getSourcesWithRuns() {
  return prisma.source.findMany({
    orderBy: { id: "asc" },
    include: {
      collectRuns: { orderBy: { startedAt: "desc" }, take: 5 },
      _count: { select: { videos: true } },
    },
  });
}

export async function hasRunningCollect(): Promise<boolean> {
  return (await prisma.collectRun.count({ where: { status: "running" } })) > 0;
}

export async function getCategoryMaps() {
  return prisma.categoryMap.findMany({
    orderBy: [{ sourceId: "asc" }, { remoteTypeId: "asc" }],
    include: { source: { select: { name: true } }, category: true },
  });
}

export async function getCategories() {
  return prisma.category.findMany({
    orderBy: [{ group: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
  });
}
