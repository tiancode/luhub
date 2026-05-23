import type { Metadata } from "next";
import { VideoCard } from "@/components/VideoCard";
import { RemoveButton } from "@/components/RemoveButton";
import { getVisitorId } from "@/lib/visitor";
import { getFavorites, getHistory } from "@/lib/library/queries";
import { clearHistory, removeFavorite, removeHistory } from "@/lib/library/actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "我的" };

const GRID = "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3";

function fmtTime(sec: number): string {
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export default async function MePage() {
  const visitorId = await getVisitorId();
  const [history, favorites] = visitorId
    ? await Promise.all([getHistory(visitorId), getFavorites(visitorId)])
    : [[], []];

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">最近观看</h1>
          {history.length > 0 && (
            <RemoveButton action={clearHistory} label="清空历史" confirm="确定清空全部观看历史？" />
          )}
        </div>

        {history.length === 0 ? (
          <p className="py-10 text-center text-muted">还没有观看记录，去首页挑一部看看吧～</p>
        ) : (
          <div className={GRID}>
            {history.map((h) => {
              const pct =
                h.duration && h.duration > 0
                  ? Math.min(100, Math.round((h.position / h.duration) * 100))
                  : 0;
              const label = [h.lineName, h.epName].filter(Boolean).join(" · ");
              return (
                <div key={h.video.id} className="space-y-1">
                  <VideoCard video={h.video} />
                  {pct > 0 && (
                    <div className="h-1 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 px-0.5 text-xs text-muted">
                    <span className="truncate">
                      {label ? `${label} · ` : ""}
                      {h.position > 0 ? fmtTime(h.position) : "继续观看"}
                    </span>
                    <RemoveButton action={removeHistory.bind(null, h.video.id)} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h1 className="text-xl font-bold">我的收藏</h1>
        {favorites.length === 0 ? (
          <p className="py-10 text-center text-muted">还没有收藏，去影片详情页点「☆ 收藏」吧～</p>
        ) : (
          <div className={GRID}>
            {favorites.map((v) => (
              <div key={v.id} className="space-y-1">
                <VideoCard video={v} />
                <div className="flex justify-end px-0.5">
                  <RemoveButton action={removeFavorite.bind(null, v.id)} label="取消收藏" />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
