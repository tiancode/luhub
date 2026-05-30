"use client";

import Link from "next/link";
import { useState } from "react";
import { buildListHref, type ListParams } from "@/lib/listParams";

interface Option {
  label: string;
  value: string;
}

/** 折叠态最多展示的选项数（含「全部」）。超出则收起，提供「更多」展开。 */
const COLLAPSED_LIMIT = 16;

export function FilterRow({
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
  const collapsible = all.length > COLLAPSED_LIMIT;
  // 当前选中项落在折叠区之外时，默认展开，避免选中态被藏起来。
  const activeHidden =
    collapsible && all.findIndex((o) => o.value === activeValue) >= COLLAPSED_LIMIT;
  const [expanded, setExpanded] = useState(activeHidden);

  const visible = collapsible && !expanded ? all.slice(0, COLLAPSED_LIMIT) : all;

  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/60 last:border-0">
      <span className="text-sm text-muted shrink-0 w-12 pt-1">{label}</span>
      <div className="flex flex-wrap gap-x-1 gap-y-1.5">
        {visible.map((opt) => {
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
        {collapsible && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="px-2.5 py-1 rounded text-sm text-primary hover:bg-surface-2 transition-colors"
          >
            {expanded ? "收起" : "更多"}
          </button>
        )}
      </div>
    </div>
  );
}
