import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getVideoDetail } from "@/lib/videos";
import { GROUP_LABELS } from "@/lib/constants";

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

      <section className="space-y-5">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">播放列表</h2>
          <span className="text-xs text-muted">（在线播放器开发中，暂为源地址）</span>
        </div>
        {video.playSources.length === 0 && (
          <p className="text-sm text-muted">暂无播放资源。</p>
        )}
        {video.playSources.map((ps) => (
          <div key={ps.id}>
            <h3 className="text-sm font-medium mb-2">{ps.fromName}</h3>
            <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-8 gap-2">
              {ps.episodes.map((ep) => (
                <a
                  key={ep.id}
                  href={ep.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2 py-1.5 rounded text-sm text-center bg-surface border border-border text-muted hover:text-foreground hover:border-primary truncate"
                  title={ep.name}
                >
                  {ep.name}
                </a>
              ))}
            </div>
          </div>
        ))}
      </section>
    </article>
  );
}
