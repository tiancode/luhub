import type { Metadata } from "next";
import { searchVideos } from "@/lib/videos";
import { VideoGrid } from "@/components/VideoGrid";
import { Pagination } from "@/components/Pagination";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function pick(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.length > 0 ? s : undefined;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const sp = await searchParams;
  const wd = pick(sp.wd);
  return { title: wd ? `搜索“${wd}”` : "搜索" };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const wd = pick(sp.wd) ?? "";
  const page = Number(pick(sp.page) ?? "1") || 1;
  const { videos, total, page: cur, totalPages } = await searchVideos(wd, page);

  const makeHref = (p: number) => {
    const q = new URLSearchParams({ wd });
    if (p > 1) q.set("page", String(p));
    return `/search?${q.toString()}`;
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">
        {wd ? (
          <>
            搜索：<span className="text-primary">{wd}</span>
          </>
        ) : (
          "搜索"
        )}
      </h1>

      {wd ? (
        <>
          <div className="mb-3 text-sm text-muted">共 {total} 个结果</div>
          <VideoGrid videos={videos} />
          <Pagination page={cur} totalPages={totalPages} makeHref={makeHref} />
        </>
      ) : (
        <p className="py-16 text-center text-muted">输入关键词开始搜索～</p>
      )}
    </div>
  );
}
