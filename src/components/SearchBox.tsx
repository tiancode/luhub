"use client";

import { useSearchParams } from "next/navigation";

export function SearchBox() {
  const wd = useSearchParams().get("wd") ?? "";
  return (
    <form action="/search" className="shrink-0">
      <input
        key={wd}
        type="search"
        name="wd"
        defaultValue={wd}
        placeholder="搜索影片…"
        aria-label="搜索影片"
        className="w-28 sm:w-48 px-3 py-1.5 rounded bg-surface-2 border border-border text-sm placeholder:text-muted focus:outline-none focus:border-primary transition-colors"
      />
    </form>
  );
}
