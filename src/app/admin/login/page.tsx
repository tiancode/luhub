import { redirect } from "next/navigation";
import { loginAction } from "@/lib/admin/actions";
import { isAuthed } from "@/lib/admin/session";
import { pick, type SearchParamsPromise } from "@/lib/searchParams";

export const dynamic = "force-dynamic";

export const metadata = { title: "采集后台登录" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParamsPromise;
}) {
  if (await isAuthed()) redirect("/admin");
  const sp = await searchParams;
  const error = pick(sp.error);

  return (
    <div className="max-w-sm mx-auto mt-16">
      <h1 className="text-xl font-bold mb-6 text-center">采集后台登录</h1>
      <form
        action={loginAction}
        className="space-y-4 rounded-lg bg-surface border border-border p-6"
      >
        <input
          type="password"
          name="password"
          placeholder="管理密码"
          autoFocus
          className="w-full px-3 py-2 rounded bg-surface-2 border border-border text-sm placeholder:text-muted focus:outline-none focus:border-primary transition-colors"
        />
        {error && <p className="text-sm text-primary">密码错误，请重试。</p>}
        <button
          type="submit"
          className="w-full px-3 py-2 rounded bg-primary text-white hover:opacity-90 transition-opacity"
        >
          登录
        </button>
      </form>
    </div>
  );
}
