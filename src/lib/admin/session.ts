// 基于 cookie 的会话读写 —— 仅用于 Server Component / Server Action（依赖 next/headers）。
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, expectedToken, verifyToken } from "./auth";

// 仅当请求确实走 HTTPS 时才给 cookie 加 Secure。
// 反代终止 TLS 时通过 x-forwarded-proto 透传真实协议；纯 HTTP（如 NAS 内网按 IP 访问）
// 绝不能加 Secure，否则浏览器不回传 cookie，表现为「登录后几秒被踢回登录页」。
// 直连 HTTPS（无反代、无该头）可用 ADMIN_COOKIE_SECURE=1 强制开启。
async function isSecureRequest(): Promise<boolean> {
  if (process.env.ADMIN_COOKIE_SECURE === "1") return true;
  const proto = (await headers()).get("x-forwarded-proto") ?? "";
  return proto.split(",")[0].trim() === "https";
}

export async function isAuthed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get(ADMIN_COOKIE)?.value);
}

/** 页面/动作入口的守卫：未登录则跳转登录页。 */
export async function requireAdmin(): Promise<void> {
  if (!(await isAuthed())) redirect("/admin/login");
}

export async function setSession(): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_COOKIE, expectedToken(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: await isSecureRequest(),
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}
