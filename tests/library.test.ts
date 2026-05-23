import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 必须在 import prisma / queries 之前设置 DATABASE_URL：prisma 单例在 import 时读取它。
const dir = mkdtempSync(join(tmpdir(), "luhub-lib-"));
process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;

let prisma: typeof import("../src/lib/prisma").prisma;
let q: typeof import("../src/lib/library/queries");

before(async () => {
  execFileSync("pnpm", ["exec", "prisma", "db", "push", "--accept-data-loss"], {
    env: process.env,
    stdio: "ignore",
  });
  ({ prisma } = await import("../src/lib/prisma"));
  q = await import("../src/lib/library/queries");
});

after(async () => {
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  await prisma.favorite.deleteMany();
  await prisma.watchHistory.deleteMany();
  await prisma.video.deleteMany();
  await prisma.source.deleteMany();
});

async function makeVideo(vodId: string, name: string) {
  const source = await prisma.source.upsert({
    where: { name: "test-src" },
    create: { name: "test-src", apiUrl: "http://x" },
    update: {},
  });
  return prisma.video.create({ data: { sourceId: source.id, sourceVodId: vodId, name } });
}

const VIS = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

test("收藏按访客隔离：只看到自己的收藏", async () => {
  const a = await makeVideo("1", "剧A");
  const b = await makeVideo("2", "剧B");
  await prisma.favorite.create({ data: { visitorId: VIS, videoId: a.id } });
  await prisma.favorite.create({ data: { visitorId: OTHER, videoId: b.id } });

  const mine = await q.getFavorites(VIS);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].id, a.id);
  assert.equal(await q.isFavorited(VIS, a.id), true);
  assert.equal(await q.isFavorited(VIS, b.id), false);
});

test("收藏按 createdAt 倒序（最近收藏在前）", async () => {
  const a = await makeVideo("1", "剧A");
  const b = await makeVideo("2", "剧B");
  await prisma.favorite.create({ data: { visitorId: VIS, videoId: a.id, createdAt: new Date(1000) } });
  await prisma.favorite.create({ data: { visitorId: VIS, videoId: b.id, createdAt: new Date(2000) } });

  const favs = await q.getFavorites(VIS);
  assert.deepEqual(favs.map((v) => v.id), [b.id, a.id]);
});

test("历史按 updatedAt 倒序，并带回续播字段", async () => {
  const a = await makeVideo("1", "剧A");
  const b = await makeVideo("2", "剧B");
  await prisma.watchHistory.create({
    data: { visitorId: VIS, videoId: a.id, lineName: "线路1", epName: "第03集", epIndex: 2, position: 120, duration: 1400, updatedAt: new Date(1000) },
  });
  await prisma.watchHistory.create({
    data: { visitorId: VIS, videoId: b.id, lineName: "线路2", epName: "第01集", epIndex: 0, position: 30, updatedAt: new Date(2000) },
  });

  const hist = await q.getHistory(VIS);
  assert.deepEqual(hist.map((h) => h.video.id), [b.id, a.id]);
  assert.equal(hist[1].lineName, "线路1");
  assert.equal(hist[1].epName, "第03集");
  assert.equal(hist[1].position, 120);
  assert.equal(hist[1].duration, 1400);
});

test("getResume 取该影片续播点；无历史返回 null", async () => {
  const a = await makeVideo("1", "剧A");
  await prisma.watchHistory.create({
    data: { visitorId: VIS, videoId: a.id, lineName: "线路1", epName: "第05集", epIndex: 4, position: 300 },
  });

  const r = await q.getResume(VIS, a.id);
  assert.ok(r);
  assert.equal(r.epName, "第05集");
  assert.equal(r.epIndex, 4);
  assert.equal(r.position, 300);
  assert.equal(await q.getResume(OTHER, a.id), null); // 别的访客没有该历史
});
