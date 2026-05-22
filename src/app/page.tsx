import Link from "next/link";
import { getHomeSections, getLatest } from "@/lib/videos";
import { VideoGrid } from "@/components/VideoGrid";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [latest, sections] = await Promise.all([
    getLatest(12),
    getHomeSections(12),
  ]);

  return (
    <div className="space-y-10">
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">最近更新</h2>
          <Link href="/latest" className="text-sm text-muted hover:text-primary">
            查看全部 →
          </Link>
        </div>
        <VideoGrid videos={latest} />
      </section>

      {sections.map((s) => (
        <section key={s.group}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">{s.label}</h2>
            <Link
              href={`/list?group=${s.group}`}
              className="text-sm text-muted hover:text-primary"
            >
              更多{s.label} →
            </Link>
          </div>
          <VideoGrid videos={s.videos} />
        </section>
      ))}
    </div>
  );
}
