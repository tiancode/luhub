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
      <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center gap-6">
        <Link href="/" className="text-lg font-bold text-primary shrink-0">
          {SITE_NAME}
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto">
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
      </div>
    </header>
  );
}
