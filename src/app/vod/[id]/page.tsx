import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getVideoDetail } from "@/lib/videos";
import { GROUP_LABELS } from "@/lib/constants";
import { Player, type PlayerLine } from "@/components/Player";
import { FavoriteButton } from "@/components/FavoriteButton";
import { RatingWidget } from "@/components/RatingWidget";
import { getVisitorId } from "@/lib/visitor";
import { getMyRating, getResume, isFavorited, type ResumeInfo } from "@/lib/library/queries";

export const dynamic = "force-dynamic";

// 把历史续播点映射成 Player 的初始线路/集索引：优先(线路名+集名)精确命中，
// 其次任意线路里同名集（线路被重采改名/删除时兜底），最后退回首条线路按集序号(不 seek)。
function locateResume(lines: PlayerLine[], resume: ResumeInfo | null) {
  const fallback = { initialLineIdx: 0, initialEpIdx: 0, resumePosition: 0 };
  if (!resume || lines.length === 0) return fallback;

  const li = lines.findIndex((l) => l.fromName === resume.lineName);
  if (li >= 0) {
    const ei = lines[li].episodes.findIndex((e) => e.name === resume.epName);
    if (ei >= 0) return { initialLineIdx: li, initialEpIdx: ei, resumePosition: resume.position };
  }
  for (let i = 0; i < lines.length; i++) {
    const ei = lines[i].episodes.findIndex((e) => e.name === resume.epName);
    if (ei >= 0) return { initialLineIdx: i, initialEpIdx: ei, resumePosition: resume.position };
  }
  const epCount = lines[0]?.episodes.length ?? 1;
  return { initialLineIdx: 0, initialEpIdx: Math.min(Math.max(resume.epIndex, 0), epCount - 1), resumePosition: 0 };
}

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

  // 匿名访客：收藏状态 + 续播点 + 我的打分（无 cookie 则视为新访客）。
  const visitorId = await getVisitorId();
  const [favorited, resume, myRating] = visitorId
    ? await Promise.all([
        isFavorited(visitorId, video.id),
        getResume(visitorId, video.id),
        getMyRating(visitorId, video.id),
      ])
    : [false, null, 0];
  const { initialLineIdx, initialEpIdx, resumePosition } = locateResume(lines, resume);

  const meta: [string, string | null | undefined][] = [
    ["分类", video.category ? GROUP_LABELS[video.category.group] ?? video.category.name : null],
    ["剧种", video.category?.name],
    ["年份", video.year ? String(video.year) : null],
    ["地区", video.area],
    ["语言", video.lang],
    ["导演", video.director],
    ["主演", video.actor],
    ["源站评分", video.score ? String(video.score) : null],
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
          <div className="mb-3 flex items-start justify-between gap-3">
            <h1 className="text-2xl font-bold">{video.name}</h1>
            <div className="shrink-0">
              <FavoriteButton videoId={video.id} initial={favorited} />
            </div>
          </div>
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
          <div className="mt-4 flex items-center gap-2 text-sm">
            <span className="text-muted shrink-0">本站评分:</span>
            <RatingWidget
              videoId={video.id}
              initialMine={myRating}
              initialAvg={video.ratingAvg}
              initialCount={video.ratingCount}
            />
          </div>
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
          <Player
            videoId={video.id}
            lines={lines}
            initialLineIdx={initialLineIdx}
            initialEpIdx={initialEpIdx}
            resumePosition={resumePosition}
          />
        )}
      </section>
    </article>
  );
}
