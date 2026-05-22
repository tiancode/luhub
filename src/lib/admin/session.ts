// 基于 cookie 的会话读写 —— 仅用于 Server Component / Server Action（依赖 next/headers）。
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, expectedToken, verifyToken } from "./auth";

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
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}
