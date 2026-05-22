// Next.js 16 中间件（v16 已由 middleware 更名为 proxy，nodejs 运行时）。
// 乐观守卫 /admin/*：cookie 无效即跳登录。真正的权威校验仍在各页面/动作的 requireAdmin。
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, verifyToken } from "@/lib/admin/auth";

export function proxy(request: NextRequest) {
  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  if (!verifyToken(token)) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // 守卫 /admin 与其子路径，但放行登录页。
  matcher: ["/admin", "/admin/((?!login).*)"],
};
