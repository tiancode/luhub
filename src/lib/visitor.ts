// 匿名访客身份：无登录，给每个浏览器发一个随机 UUID 存进 first-party cookie。
// 它是「不会撞车」的稳定标识——服务端直接读，收藏/历史都挂在它下面。
// 仅用于 Server Component(读) / Server Action(读写)，依赖 next/headers。
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";

export const VISITOR_COOKIE = "luhub_vid";
const ONE_YEAR = 60 * 60 * 24 * 365;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 读：只取已有 ID，不种 cookie（Server Component 渲染期不能写 cookie）。无则返回 null。
export async function getVisitorId(): Promise<string | null> {
  const v = (await cookies()).get(VISITOR_COOKIE)?.value;
  return v && UUID_RE.test(v) ? v : null;
}

// 写：没有就发一个并种 cookie。只能在 Server Action / Route Handler 里调用。
// 不强制 Secure：内网 HTTP（按 IP 访问 NAS）也要能存，与 admin session 同理。
export async function ensureVisitorId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(VISITOR_COOKIE)?.value;
  if (existing && UUID_RE.test(existing)) return existing;
  const id = randomUUID();
  store.set(VISITOR_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR,
  });
  return id;
}
