import { requireAdmin } from "@/lib/admin/session";
import { getSourcesWithRuns } from "@/lib/admin/queries";
import { createSourceAction, collectAllAction } from "@/lib/admin/actions";
import { SourceCard } from "@/components/admin/SourceCard";
import { RunningPoller } from "@/components/admin/RunningPoller";
import { pick, type SearchParamsPromise } from "@/lib/searchParams";

export const dynamic = "force-dynamic";

export const metadata = { title: "采集后台 · 资源站" };

const inputCls =
  "px-3 py-1.5 rounded bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary transition-colors";

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: SearchParamsPromise;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const error = pick(sp.error);
  const sources = await getSourcesWithRuns();
  const running = sources.some((s) =>
    s.collectRuns.some((r) => r.status === "running"),
  );

  return (
    <div className="space-y-5">
      {running && <RunningPoller />}

      {error && (
        <p className="rounded bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-3 py-2">
          {error}
        </p>
      )}

      {/* 新增资源站 */}
      <details className="rounded-lg bg-surface border border-border p-4">
        <summary className="cursor-pointer font-semibold list-none flex items-center gap-2">
          <span className="text-primary">＋</span> 新增资源站
        </summary>
        <form
          action={createSourceAction}
          className="mt-4 grid sm:grid-cols-2 gap-3"
        >
          <label className="text-xs text-muted block">
            名称（创建后不可改）
            <input
              name="name"
              required
              placeholder="如：示例资源站"
              className={`${inputCls} w-full mt-1`}
            />
          </label>
          <label className="text-xs text-muted block">
            类型
            <select name="kind" defaultValue="maccms_json" className={`${inputCls} w-full mt-1`}>
              <option value="maccms_json">maccms_json</option>
              <option value="maccms_xml">maccms_xml</option>
              <option value="html">html</option>
            </select>
          </label>
          <label className="text-xs text-muted block sm:col-span-2">
            接口地址（maccms：/api.php/provide/vod/）
            <input
              name="apiUrl"
              required
              placeholder="https://站点/api.php/provide/vod/"
              className={`${inputCls} w-full mt-1`}
            />
          </label>
          <label className="text-xs text-muted flex items-center gap-2">
            <input name="enabled" type="checkbox" defaultChecked />
            创建后启用
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="px-4 py-2 rounded bg-primary text-white text-sm hover:opacity-90 transition-opacity"
            >
              添加
            </button>
          </div>
        </form>
      </details>

      {/* 采集全部启用源 */}
      {sources.length > 0 && (
        <form
          action={collectAllAction}
          className="flex items-end gap-2 flex-wrap rounded-lg bg-surface border border-border p-4"
        >
          <span className="font-semibold mr-2">采集全部启用源</span>
          <label className="text-xs text-muted flex flex-col gap-1">
            页数
            <input name="pages" type="number" min={1} defaultValue={5} className={`${inputCls} w-20`} />
          </label>
          <label className="text-xs text-muted flex flex-col gap-1">
            增量(小时)
            <input name="hours" type="number" min={1} placeholder="可选" className={`${inputCls} w-24`} />
          </label>
          <label className="text-xs text-muted flex items-center gap-1 pb-2">
            <input name="full" type="checkbox" value="1" />
            全量
          </label>
          <button
            type="submit"
            className="px-3 py-1.5 rounded text-sm bg-primary text-white hover:opacity-90 transition-opacity"
          >
            全部采集
          </button>
        </form>
      )}

      {sources.length === 0 ? (
        <p className="text-sm text-muted">
          还没有资源站，展开上方「新增资源站」添加。
        </p>
      ) : (
        <div className="space-y-4">
          {sources.map((s) => (
            <SourceCard key={s.id} source={s} />
          ))}
        </div>
      )}
    </div>
  );
}
