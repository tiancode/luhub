import { GROUPS } from "@/lib/constants";
import { type ListParams } from "@/lib/listParams";
import { FilterRow } from "@/components/FilterRow";

export function FilterBar({
  current,
  areas,
  years,
  categories,
}: {
  current: ListParams;
  areas: string[];
  years: number[];
  categories: { id: number; name: string }[];
}) {
  return (
    <div className="rounded-lg bg-surface border border-border px-4 py-1 mb-5">
      <FilterRow
        label="分类"
        patchKey="group"
        current={current}
        activeValue={current.group ?? ""}
        options={GROUPS.map((g) => ({ label: g.label, value: g.key }))}
      />
      {categories.length > 0 && (
        <FilterRow
          label="剧种"
          patchKey="type"
          current={current}
          activeValue={current.type ?? ""}
          options={categories.map((c) => ({
            label: c.name,
            value: String(c.id),
          }))}
        />
      )}
      <FilterRow
        label="地区"
        patchKey="area"
        current={current}
        activeValue={current.area ?? ""}
        options={areas.map((a) => ({ label: a, value: a }))}
      />
      <FilterRow
        label="年份"
        patchKey="year"
        current={current}
        activeValue={current.year ?? ""}
        options={years.map((y) => ({ label: String(y), value: String(y) }))}
      />
    </div>
  );
}
