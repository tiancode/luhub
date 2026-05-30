// 共享的 DB 测试脚手架：临时 SQLite 库 + prisma db push + makeVideo 帮手。
// 关键时序：prisma 单例在 import 时读 DATABASE_URL，故 createTempDatabase() 必须在模块
// 顶层、import prisma 之前同步调用；本文件只做 type-only import，加载它不会拉起 prisma。
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Prisma = typeof import("../../src/lib/prisma").prisma;

export const VIS = "11111111-1111-4111-8111-111111111111";
export const OTHER = "22222222-2222-4222-8222-222222222222";

let dir: string;

/** 模块顶层调用：建临时库目录并设置 DATABASE_URL（须早于 import prisma）。 */
export function createTempDatabase(prefix: string): void {
  dir = mkdtempSync(join(tmpdir(), prefix));
  process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
}

/** before() 调用：把 schema 推到临时库并返回 prisma 单例。 */
export async function setupDb(): Promise<Prisma> {
  execFileSync("pnpm", ["exec", "prisma", "db", "push", "--accept-data-loss"], {
    env: process.env,
    stdio: "ignore",
  });
  const { prisma } = await import("../../src/lib/prisma");
  return prisma;
}

/** after() 调用：断开连接并删临时库。 */
export async function teardownDb(prisma: Prisma): Promise<void> {
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
}

/** 建一条挂在共用 test-src 源下的影片；extra 可覆盖 area/year/ratingAvg 等字段。 */
export async function makeVideo(
  prisma: Prisma,
  vodId: string,
  name: string,
  extra: Record<string, unknown> = {},
) {
  const source = await prisma.source.upsert({
    where: { name: "test-src" },
    create: { name: "test-src", apiUrl: "http://x" },
    update: {},
  });
  return prisma.video.create({
    data: { sourceId: source.id, sourceVodId: vodId, name, ...extra },
  });
}
