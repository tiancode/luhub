import Link from "next/link";
import { GROUPS } from "@/lib/constants";
import { buildListHref, type ListParams } from "@/lib/listParams";

interface Option {
  label: string;
  value: string;
}

function Row({
  label,
  options,
  activeValue,
  current,
  patchKey,
}: {
  label: string;
  options: Option[];
  activeValue: string;
  current: ListParams;
  patchKey: keyof ListParams;
}) {
  const all: Option[] = [{ label: "全部", value: "" }, ...options];
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/60 last:border-0">
      <span className="text-sm text-muted shrink-0 w-12 pt-1">{label}</span>
      <div className="flex flex-wrap gap-x-1 gap-y-1.5">
        {all.map((opt) => {
          const active = activeValue === opt.value;
          return (
            <Link
              key={opt.value || "__all"}
              href={buildListHref(current, { [patchKey]: opt.value || undefined })}
              className={`px-2.5 py-1 rounded text-sm transition-colors ${
                active
                  ? "bg-primary text-white"
                  : "text-muted hover:text-foreground hover:bg-surface-2"
              }`}
            >
              {opt.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

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
      <Row
        label="分类"
        patchKey="group"
        current={current}
        activeValue={current.group ?? ""}
        options={GROUPS.map((g) => ({ label: g.label, value: g.key }))}
      />
      {categories.length > 0 && (
        <Row
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
      <Row
        label="地区"
        patchKey="area"
        current={current}
        activeValue={current.area ?? ""}
        options={areas.map((a) => ({ label: a, value: a }))}
      />
      <Row
        label="年份"
        patchKey="year"
        current={current}
        activeValue={current.year ?? ""}
        options={years.map((y) => ({ label: String(y), value: String(y) }))}
      />
    </div>
  );
}
