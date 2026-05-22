import Link from "next/link";
import { buildListHref, type ListParams } from "@/lib/listParams";

export function Pagination({
  current,
  page,
  totalPages,
}: {
  current: ListParams;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;

  const windowSize = 5;
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  const end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);

  const pages: number[] = [];
  for (let p = start; p <= end; p++) pages.push(p);

  const linkCls = (active: boolean) =>
    `px-3 py-1.5 rounded text-sm border transition-colors ${
      active
        ? "bg-primary text-white border-primary"
        : "border-border text-muted hover:text-foreground hover:bg-surface-2"
    }`;

  return (
    <nav className="flex items-center justify-center gap-1.5 mt-8 flex-wrap">
      {page > 1 && (
        <Link href={buildListHref(current, { page: page - 1 })} className={linkCls(false)}>
          上一页
        </Link>
      )}
      {start > 1 && (
        <Link href={buildListHref(current, { page: 1 })} className={linkCls(false)}>
          1
        </Link>
      )}
      {start > 2 && <span className="px-2 text-muted">…</span>}
      {pages.map((p) => (
        <Link key={p} href={buildListHref(current, { page: p })} className={linkCls(p === page)}>
          {p}
        </Link>
      ))}
      {end < totalPages - 1 && <span className="px-2 text-muted">…</span>}
      {end < totalPages && (
        <Link href={buildListHref(current, { page: totalPages })} className={linkCls(false)}>
          {totalPages}
        </Link>
      )}
      {page < totalPages && (
        <Link href={buildListHref(current, { page: page + 1 })} className={linkCls(false)}>
          下一页
        </Link>
      )}
    </nav>
  );
}
