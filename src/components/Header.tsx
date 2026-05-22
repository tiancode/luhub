import Link from "next/link";
import { GROUPS, SITE_NAME } from "@/lib/constants";

const navItems = [
  { href: "/", label: "首页" },
  ...GROUPS.map((g) => ({ href: `/list?group=${g.key}`, label: g.label })),
  { href: "/latest", label: "最近更新" },
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
        <form action="/search" className="shrink-0">
          <input
            type="search"
            name="wd"
            placeholder="搜索影片…"
            aria-label="搜索影片"
            className="w-28 sm:w-48 px-3 py-1.5 rounded bg-surface-2 border border-border text-sm placeholder:text-muted focus:outline-none focus:border-primary transition-colors"
          />
        </form>
      </div>
    </header>
  );
}
