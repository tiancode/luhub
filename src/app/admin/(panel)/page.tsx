import Link from "next/link";
import { requireAdmin } from "@/lib/admin/session";
import { getDashboard } from "@/lib/admin/queries";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { RunningPoller } from "@/components/admin/RunningPoller";
import { fmtDateTime } from "@/lib/admin/format";

export const dynamic = "force-dynamic";

export const metadata = { title: "采集后台 · 仪表盘" };

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-surface border border-border p-4">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted mt-1">{label}</div>
    </div>
  );
}

export default async function AdminDashboard() {
  await requireAdmin();
  const d = await getDashboard();
  const running = d.sources.some((s) => s.collectRuns[0]?.status === "running");

  return (
    <div className="space-y-6">
      {running && <RunningPoller />}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="资源站" value={d.sourceCount} />
        <Stat label="启用中" value={d.enabledCount} />
        <Stat label="影片" value={d.videoCount} />
        <Stat label="分类" value={d.categoryCount} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">资源站状态</h2>
          <Link href="/admin/sources" className="text-sm text-primary hover:underline">
            管理资源站 →
          </Link>
        </div>

        {d.sources.length === 0 ? (
          <p className="text-sm text-muted">
            还没有资源站，去
            <Link href="/admin/sources" className="text-primary">
              {" "}
              添加一个{" "}
            </Link>
            。
          </p>
        ) : (
          <div className="rounded-lg bg-surface border border-border divide-y divide-border/60">
            {d.sources.map((s) => {
              const last = s.collectRuns[0];
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-3 px-4 py-3 flex-wrap text-sm"
                >
                  <span className="font-medium">{s.name}</span>
                  {s.enabled ? (
                    <span className="text-xs text-green-400">启用</span>
                  ) : (
                    <span className="text-xs text-muted">停用</span>
                  )}
                  <span className="text-xs text-muted">影片 {s._count.videos}</span>
                  <span className="ml-auto text-xs text-muted">
                    上次采集 {fmtDateTime(s.lastSyncAt)}
                  </span>
                  {last ? (
                    <StatusBadge status={last.status} />
                  ) : (
                    <span className="text-xs text-muted">未采集</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
