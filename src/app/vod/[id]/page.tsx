import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getVideoDetail } from "@/lib/videos";
import { GROUP_LABELS } from "@/lib/constants";
import { Player, type PlayerLine } from "@/components/Player";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { id } = await params;
  const video = await getVideoDetail(Number(id));
  return { title: video ? video.name : "未找到" };
}

export default async function VodDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const video = await getVideoDetail(Number(id));
  if (!video) notFound();

  // 由已缓存剧集合成一条「缓存线路」（按集名去重，跨原线路同名只显示一条）。
  const seen = new Set<string>();
  const cachedEps = video.cachedEpisodes
    .filter((c) => c.localUrl && !seen.has(c.epName) && (seen.add(c.epName), true))
    .map((c) => ({ id: -c.id, name: c.epName, url: c.localUrl! }));
  const cacheLine: PlayerLine | null =
    cachedEps.length > 0
      ? { id: -1, fromName: "缓存线路", cached: true, episodes: cachedEps }
      : null;
  const lines: PlayerLine[] = [...video.playSources, ...(cacheLine ? [cacheLine] : [])];

  const meta: [string, string | null | undefined][] = [
    ["分类", video.category ? GROUP_LABELS[video.category.group] ?? video.category.name : null],
    ["剧种", video.category?.name],
    ["年份", video.year ? String(video.year) : null],
    ["地区", video.area],
    ["语言", video.lang],
    ["导演", video.director],
    ["主演", video.actor],
    ["评分", video.score ? String(video.score) : null],
    ["状态", video.remarks],
    ["来源", video.source?.name],
  ];

  return (
    <article className="space-y-6">
      <div className="flex gap-5 flex-col sm:flex-row">
        <div className="w-40 shrink-0">
          <div className="aspect-[2/3] rounded-lg overflow-hidden bg-surface-2 border border-border">
            {video.pic ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={video.pic} alt={video.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted text-sm">
                无封面
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold mb-3">{video.name}</h1>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            {meta
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="text-muted shrink-0">{k}:</dt>
                  <dd className="truncate">{v}</dd>
                </div>
              ))}
          </dl>
        </div>
      </div>

      {video.content && (
        <section>
          <h2 className="text-lg font-semibold mb-2">简介</h2>
          <p className="text-sm text-muted leading-relaxed whitespace-pre-line">
            {video.content}
          </p>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">在线播放</h2>
        {lines.length === 0 ? (
          <p className="text-sm text-muted">暂无播放资源。</p>
        ) : (
          <Player videoId={video.id} lines={lines} />
        )}
      </section>
    </article>
  );
}
