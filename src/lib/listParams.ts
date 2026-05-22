export interface ListParams {
  group?: string;
  area?: string;
  year?: string;
  type?: string; // categoryId
  page?: number;
}

/** 合并当前筛选与改动，生成 /list 链接；改动筛选时重置页码 */
export function buildListHref(
  current: ListParams,
  patch: Partial<ListParams>,
): string {
  const merged: ListParams = { ...current, ...patch };
  if (!("page" in patch)) merged.page = 1;

  const sp = new URLSearchParams();
  if (merged.group) sp.set("group", merged.group);
  if (merged.area) sp.set("area", merged.area);
  if (merged.year) sp.set("year", merged.year);
  if (merged.type) sp.set("type", merged.type);
  if (merged.page && merged.page > 1) sp.set("page", String(merged.page));

  const qs = sp.toString();
  return qs ? `/list?${qs}` : "/list";
}
