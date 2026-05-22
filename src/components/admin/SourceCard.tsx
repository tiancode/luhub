import {
  runCollectAction,
  toggleSourceAction,
  deleteSourceAction,
  updateSourceAction,
} from "@/lib/admin/actions";
import type { getSourcesWithRuns } from "@/lib/admin/queries";
import { StatusBadge } from "./StatusBadge";
import { fmtDateTime } from "@/lib/admin/format";

type SourceWithRuns = Awaited<ReturnType<typeof getSourcesWithRuns>>[number];

const inputCls =
  "px-3 py-1.5 rounded bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary transition-colors";
const btnCls =
  "px-3 py-1.5 rounded text-sm border border-border text-muted hover:text-foreground hover:bg-surface-2 transition-colors";
const primaryBtn =
  "px-3 py-1.5 rounded text-sm bg-primary text-white hover:opacity-90 transition-opacity";
const dangerBtn =
  "px-3 py-1.5 rounded text-sm border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors";

function runDesc(r: SourceWithRuns["collectRuns"][number]): string {
  if (r.full) return "全量";
  if (r.hours) return `近${r.hours}h`;
  return `${r.pages ?? "?"}页`;
}

export function SourceCard({ source }: { source: SourceWithRuns }) {
  return (
    <div className="rounded-lg bg-surface border border-border p-4 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-semibold">{source.name}</span>
        {source.enabled ? (
          <span className="text-xs text-green-400">启用</span>
        ) : (
          <span className="text-xs text-muted">停用</span>
        )}
        <span className="text-xs text-muted">{source.kind}</span>
        <span className="text-xs text-muted ml-auto">
          影片 {source._count.videos} · 上次 {fmtDateTime(source.lastSyncAt)}
        </span>
      </div>
      <p className="text-xs text-muted break-all">{source.apiUrl}</p>

      {/* 采集 */}
      <form action={runCollectAction} className="flex items-end gap-2 flex-wrap">
        <input type="hidden" name="id" value={source.id} />
        <label className="text-xs text-muted flex flex-col gap-1">
          页数
          <input
            name="pages"
            type="number"
            min={1}
            defaultValue={5}
            className={`${inputCls} w-20`}
          />
        </label>
        <label className="text-xs text-muted flex flex-col gap-1">
          增量(小时)
          <input
            name="hours"
            type="number"
            min={1}
            placeholder="可选"
            className={`${inputCls} w-24`}
          />
        </label>
        <label className="text-xs text-muted flex items-center gap-1 pb-2">
          <input name="full" type="checkbox" value="1" />
          全量
        </label>
        <button type="submit" className={primaryBtn}>
          开始采集
        </button>
      </form>

      {/* 管理 */}
      <div className="flex items-center gap-2 flex-wrap">
        <form action={toggleSourceAction}>
          <input type="hidden" name="id" value={source.id} />
          <button type="submit" className={btnCls}>
            {source.enabled ? "停用" : "启用"}
          </button>
        </form>

        <details className="relative">
          <summary className={`${btnCls} cursor-pointer list-none`}>编辑</summary>
          <form
            action={updateSourceAction}
            className="absolute z-10 mt-2 w-80 rounded-lg bg-surface-2 border border-border p-3 space-y-2"
          >
            <input type="hidden" name="id" value={source.id} />
            <label className="text-xs text-muted block">
              接口地址
              <input
                name="apiUrl"
                defaultValue={source.apiUrl}
                className={`${inputCls} w-full mt-1`}
              />
            </label>
            <label className="text-xs text-muted block">
              类型
              <select
                name="kind"
                defaultValue={source.kind}
                className={`${inputCls} w-full mt-1`}
              >
                <option value="maccms_json">maccms_json</option>
                <option value="maccms_xml">maccms_xml</option>
                <option value="html">html</option>
              </select>
            </label>
            <label className="text-xs text-muted flex items-center gap-2">
              <input name="enabled" type="checkbox" defaultChecked={source.enabled} />
              启用
            </label>
            <button type="submit" className={primaryBtn}>
              保存
            </button>
          </form>
        </details>

        <details className="relative">
          <summary className={`${dangerBtn} cursor-pointer list-none`}>删除</summary>
          <form
            action={deleteSourceAction}
            className="absolute z-10 mt-2 w-64 rounded-lg bg-surface-2 border border-border p-3 space-y-2"
          >
            <input type="hidden" name="id" value={source.id} />
            <p className="text-xs text-muted">
              确认删除「{source.name}」及其全部影片、分类映射与采集记录？
            </p>
            <button type="submit" className={dangerBtn}>
              确认删除
            </button>
          </form>
        </details>
      </div>

      {/* 采集记录 */}
      {source.collectRuns.length > 0 && (
        <div className="border-t border-border/60 pt-2 space-y-1">
          {source.collectRuns.map((r) => (
            <div
              key={r.id}
              className="text-xs text-muted flex items-center gap-2 flex-wrap"
            >
              <StatusBadge status={r.status} />
              <span>{fmtDateTime(r.startedAt)}</span>
              <span>{runDesc(r)}</span>
              {r.status !== "running" && (
                <span>
                  +{r.videos} 影片 / {r.categories} 分类
                </span>
              )}
              {r.status === "failed" && r.message && (
                <span className="text-red-400 break-all">
                  {r.message.split("\n").pop()}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
