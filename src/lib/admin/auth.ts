// 采集后台 单密码鉴权 —— 纯 Node crypto，供 proxy.ts 与 Server Action 共用。
import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "luhub_admin";

function getPassword(): string {
  return process.env.ADMIN_PASSWORD ?? "";
}

/** cookie 中存放的派生令牌：HMAC(secret, password)。改密码即自动失效。 */
export function expectedToken(): string {
  const password = getPassword();
  const secret = process.env.ADMIN_SECRET ?? password;
  return createHmac("sha256", secret).update(password).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** 校验 cookie 令牌。未配置 ADMIN_PASSWORD 时一律拒绝（后台默认上锁）。 */
export function verifyToken(value: string | undefined | null): boolean {
  if (!getPassword() || !value) return false;
  return safeEqual(value, expectedToken());
}

/** 校验登录提交的明文密码。 */
export function verifyPassword(input: string): boolean {
  const password = getPassword();
  if (!password) return false;
  return safeEqual(input, password);
}
