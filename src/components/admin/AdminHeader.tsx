import Link from "next/link";
import { logoutAction } from "@/lib/admin/actions";

const nav = [
  { href: "/admin", label: "仪表盘" },
  { href: "/admin/sources", label: "资源站" },
  { href: "/admin/categories", label: "分类映射" },
];

const linkCls =
  "px-3 py-1.5 rounded text-sm text-muted hover:text-foreground hover:bg-surface-2 whitespace-nowrap transition-colors";

export function AdminHeader() {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-surface border border-border px-4 h-12 mb-5">
      <span className="font-bold text-primary shrink-0">采集后台</span>
      <nav className="flex items-center gap-1 overflow-x-auto flex-1">
        {nav.map((i) => (
          <Link key={i.href} href={i.href} className={linkCls}>
            {i.label}
          </Link>
        ))}
      </nav>
      <Link href="/" className={linkCls}>
        返回前台
      </Link>
      <form action={logoutAction} className="shrink-0">
        <button
          type="submit"
          className="px-3 py-1.5 rounded text-sm border border-border text-muted hover:text-foreground hover:bg-surface-2 transition-colors"
        >
          退出
        </button>
      </form>
    </div>
  );
}
