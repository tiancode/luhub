import { Suspense } from "react";
import Link from "next/link";
import { GROUPS, SITE_NAME } from "@/lib/constants";
import { SearchBox } from "@/components/SearchBox";

const navItems = [
  { href: "/", label: "首页" },
  ...GROUPS.map((g) => ({ href: `/list?group=${g.key}`, label: g.label })),
  { href: "/latest", label: "最近更新" },
  { href: "/me", label: "我的" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
      <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center gap-4">
        <Link href="/" className="text-lg font-bold text-primary shrink-0">
          {SITE_NAME}
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto flex-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-3 py-1.5 rounded text-sm text-muted hover:text-foreground hover:bg-surface-2 whitespace-nowrap transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <Suspense fallback={<div className="w-28 sm:w-48 shrink-0" />}>
          <SearchBox />
        </Suspense>
      </div>
    </header>
  );
}
