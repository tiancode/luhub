import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { GROUPS, type GroupKey } from "@/lib/constants";
import type { VideoCardData } from "@/components/VideoCard";

export const PAGE_SIZE = 30;

const cardSelect = {
  id: true,
  name: true,
  pic: true,
  remarks: true,
  year: true,
  area: true,
} satisfies Prisma.VideoSelect;

export interface ListQuery {
  group?: string;
  area?: string;
  year?: string;
  type?: string;
  sort?: string;
  page?: number;
}

/**
 * 排序白名单：key → Prisma orderBy。绝不直接拼用户传入的字符串，
 * 既防注入也防排到没意义的字段。新增排序在此加一行即可。
 * 空 key / 未知 key 一律回落到 "latest"（最新发布）。
 */
const SORTS = {
  latest: [{ releasedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
  rating: [
    { ratingAvg: { sort: "desc", nulls: "last" } },
    { ratingCount: "desc" }, // 同分时打分人数多的靠前
    { id: "desc" },
  ],
  added: [{ createdAt: "desc" }, { id: "desc" }],
} satisfies Record<string, Prisma.VideoOrderByWithRelationInput[]>;

export type SortKey = keyof typeof SORTS;

/** 排序行的展示选项（顺序即 UI 顺序）。latest 用空 value，即默认、URL 不带 sort。 */
export const SORT_OPTIONS: { label: string; value: string }[] = [
  { label: "最新发布", value: "" },
  { label: "本站评分", value: "rating" },
  { label: "最近收录", value: "added" },
];

function resolveOrder(sort?: string): Prisma.VideoOrderByWithRelationInput[] {
  return SORTS[sort as SortKey] ?? SORTS.latest;
}

function buildWhere(q: ListQuery): Prisma.VideoWhereInput {
  const where: Prisma.VideoWhereInput = {};
  if (q.type) {
    where.categoryId = Number(q.type);
  } else if (q.group) {
    where.category = { group: q.group };
  }
  if (q.area) where.area = q.area;
  if (q.year) where.year = Number(q.year);
  return where;
}

export async function getVideoList(q: ListQuery) {
  const page = Math.max(1, q.page ?? 1);
  const where = buildWhere(q);

  const [total, videos] = await Promise.all([
    prisma.video.count({ where }),
    prisma.video.findMany({
      where,
      select: cardSelect,
      orderBy: resolveOrder(q.sort),
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  return {
    videos: videos as VideoCardData[],
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/** 转义 LIKE 通配符，使 % _ \ 按字面量匹配（配合 ESCAPE '\'） */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function searchVideos(keyword: string, page = 1) {
  const kw = keyword.trim();
  if (!kw) {
    return { videos: [] as VideoCardData[], total: 0, page: 1, totalPages: 1 };
  }
  const pattern = `%${escapeLike(kw)}%`;
  const p = Math.max(1, page);
  const offset = (p - 1) * PAGE_SIZE;

  // Prisma 的 `contains` 不会转义 LIKE 通配符且不带 ESCAPE 子句，故用参数化原始 SQL。
  const [countRows, videos] = await Promise.all([
    prisma.$queryRaw<{ count: number | bigint }[]>`
      SELECT COUNT(*) AS "count" FROM "Video" WHERE "name" LIKE ${pattern} ESCAPE '\\'
    `,
    prisma.$queryRaw<VideoCardData[]>`
      SELECT "id", "name", "pic", "remarks", "year", "area"
      FROM "Video"
      WHERE "name" LIKE ${pattern} ESCAPE '\\'
      ORDER BY "releasedAt" DESC NULLS LAST, "id" DESC
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `,
  ]);

  const total = Number(countRows[0]?.count ?? 0);

  return {
    videos,
    total,
    page: p,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getFacets(group?: string) {
  const scope: Prisma.VideoWhereInput = group ? { category: { group } } : {};

  const [areaRows, yearRows, categories] = await Promise.all([
    prisma.video.findMany({
      where: { ...scope, area: { not: null } },
      select: { area: true },
      distinct: ["area"],
    }),
    prisma.video.findMany({
      where: { ...scope, year: { not: null } },
      select: { year: true },
      distinct: ["year"],
    }),
    group
      ? prisma.category.findMany({
          where: { group, videos: { some: {} } },
          select: { id: true, name: true },
          orderBy: { sortOrder: "asc" },
        })
      : Promise.resolve([] as { id: number; name: string }[]),
  ]);

  const areas = areaRows
    .map((r) => r.area!)
    .filter(Boolean)
    .sort();
  const years = yearRows
    .map((r) => r.year!)
    .filter((y): y is number => y != null)
    .sort((a, b) => b - a);

  return { areas, years, categories };
}

export async function getLatest(limit = PAGE_SIZE) {
  const videos = await prisma.video.findMany({
    select: cardSelect,
    orderBy: [{ releasedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
    take: limit,
  });
  return videos as VideoCardData[];
}

export interface HomeSection {
  group: GroupKey;
  label: string;
  videos: VideoCardData[];
}

export async function getHomeSections(perGroup = 12): Promise<HomeSection[]> {
  const sections = await Promise.all(
    GROUPS.map(async (g) => {
      const videos = await prisma.video.findMany({
        where: { category: { group: g.key } },
        select: cardSelect,
        orderBy: [
          { releasedAt: { sort: "desc", nulls: "last" } },
          { id: "desc" },
        ],
        take: perGroup,
      });
      return { group: g.key, label: g.label, videos: videos as VideoCardData[] };
    }),
  );
  return sections.filter((s) => s.videos.length > 0);
}

export async function getVideoDetail(id: number) {
  return prisma.video.findUnique({
    where: { id },
    include: {
      category: true,
      source: { select: { name: true } },
      playSources: {
        orderBy: { sortOrder: "asc" },
        include: { episodes: { orderBy: { sortOrder: "asc" } } },
      },
      // 已缓存到本地的剧集，用于在播放器里合成「缓存线路」。
      cachedEpisodes: {
        where: { status: "ready" },
        orderBy: [{ sortOrder: "asc" }, { epName: "asc" }],
      },
    },
  });
}
