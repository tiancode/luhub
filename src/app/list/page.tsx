import type { Metadata } from "next";
import { getVideoList, getFacets } from "@/lib/videos";
import { GROUP_LABELS } from "@/lib/constants";
import { FilterBar } from "@/components/FilterBar";
import { VideoGrid } from "@/components/VideoGrid";
import { Pagination } from "@/components/Pagination";
import { buildListHref, type ListParams } from "@/lib/listParams";
import { pick, type SearchParamsPromise } from "@/lib/searchParams";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParamsPromise;
}): Promise<Metadata> {
  const sp = await searchParams;
  const group = pick(sp.group);
  const label = group ? GROUP_LABELS[group] ?? "全部" : "全部";
  return { title: `${label}片库` };
}

export default async function ListPage({
  searchParams,
}: {
  searchParams: SearchParamsPromise;
}) {
  const sp = await searchParams;
  const current: ListParams = {
    group: pick(sp.group),
    area: pick(sp.area),
    year: pick(sp.year),
    type: pick(sp.type),
    page: Number(pick(sp.page) ?? "1") || 1,
  };

  const [{ videos, total, page, totalPages }, facets] = await Promise.all([
    getVideoList(current),
    getFacets(current.group),
  ]);

  const heading = current.group
    ? `${GROUP_LABELS[current.group] ?? "全部"}片库`
    : "全部片库";

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">{heading}</h1>

      <FilterBar
        current={current}
        areas={facets.areas}
        years={facets.years}
        categories={facets.categories}
      />

      <div className="flex items-center justify-between mb-3 text-sm text-muted">
        <span>共 {total} 部</span>
        <span>
          第 {page}/{totalPages} 页
        </span>
      </div>

      <VideoGrid videos={videos} />

      <Pagination
        page={page}
        totalPages={totalPages}
        makeHref={(p) => buildListHref(current, { page: p })}
      />
    </div>
  );
}
