import { requireAdmin } from "@/lib/admin/session";
import { getCategoryMaps, getCategories } from "@/lib/admin/queries";
import {
  repointCategoryMapAction,
  updateCategoryAction,
} from "@/lib/admin/actions";
import { GROUPS, GROUP_LABELS } from "@/lib/constants";

export const dynamic = "force-dynamic";

export const metadata = { title: "采集后台 · 分类映射" };

const inputCls =
  "px-3 py-1.5 rounded bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary transition-colors";
const btnCls =
  "px-3 py-1.5 rounded text-sm border border-border text-muted hover:text-foreground hover:bg-surface-2 transition-colors";

export default async function CategoriesPage() {
  await requireAdmin();
  const [maps, categories] = await Promise.all([
    getCategoryMaps(),
    getCategories(),
  ]);

  return (
    <div className="space-y-8">
      {/* 资源站分类 → 本站分类 映射 */}
      <section>
        <h2 className="font-bold mb-1">分类映射</h2>
        <p className="text-xs text-muted mb-3">
          采集时按资源站的 type_id 自动建映射；可在此把某个映射改指到其它本站分类。
        </p>
        {maps.length === 0 ? (
          <p className="text-sm text-muted">暂无映射，采集后会自动生成。</p>
        ) : (
          <div className="rounded-lg bg-surface border border-border divide-y divide-border/60">
            {maps.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-3 px-4 py-3 flex-wrap text-sm"
              >
                <span className="text-muted text-xs w-40 shrink-0">
                  {m.source.name} · type {m.remoteTypeId}
                </span>
                <span>{m.remoteName ?? "（无名）"}</span>
                <span className="text-muted">→</span>
                <form
                  action={repointCategoryMapAction}
                  className="flex items-center gap-2 ml-auto"
                >
                  <input type="hidden" name="id" value={m.id} />
                  <select
                    name="categoryId"
                    defaultValue={m.categoryId}
                    className={inputCls}
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}（{GROUP_LABELS[c.group] ?? c.group}）
                      </option>
                    ))}
                  </select>
                  <button type="submit" className={btnCls}>
                    保存
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 本站分类编辑 */}
      <section>
        <h2 className="font-bold mb-3">本站分类</h2>
        {categories.length === 0 ? (
          <p className="text-sm text-muted">暂无分类。</p>
        ) : (
          <div className="rounded-lg bg-surface border border-border divide-y divide-border/60">
            {categories.map((c) => (
              <form
                key={c.id}
                action={updateCategoryAction}
                className="flex items-center gap-2 px-4 py-3 flex-wrap text-sm"
              >
                <input type="hidden" name="id" value={c.id} />
                <input
                  name="name"
                  defaultValue={c.name}
                  className={`${inputCls} w-40`}
                />
                <select name="group" defaultValue={c.group} className={inputCls}>
                  {GROUPS.map((g) => (
                    <option key={g.key} value={g.key}>
                      {g.label}
                    </option>
                  ))}
                  <option value="other">其他</option>
                </select>
                <label className="text-xs text-muted flex items-center gap-1">
                  排序
                  <input
                    name="sortOrder"
                    type="number"
                    defaultValue={c.sortOrder}
                    className={`${inputCls} w-20`}
                  />
                </label>
                <span className="text-xs text-muted">/{c.slug}</span>
                <button type="submit" className={`${btnCls} ml-auto`}>
                  保存
                </button>
              </form>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
