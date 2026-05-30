import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createTempDatabase, setupDb, teardownDb, makeVideo, VIS, OTHER } from "./helpers/db";

// 须在 import prisma 之前设置 DATABASE_URL（prisma 单例在 import 时读取它）。
createTempDatabase("luhub-lib-");

let prisma: typeof import("../src/lib/prisma").prisma;
let q: typeof import("../src/lib/library/queries");

before(async () => {
  prisma = await setupDb();
  q = await import("../src/lib/library/queries");
});

after(() => teardownDb(prisma));

beforeEach(async () => {
  await prisma.favorite.deleteMany();
  await prisma.watchHistory.deleteMany();
  await prisma.video.deleteMany();
  await prisma.source.deleteMany();
});

test("收藏按访客隔离：只看到自己的收藏", async () => {
  const a = await makeVideo(prisma, "1", "剧A");
  const b = await makeVideo(prisma, "2", "剧B");
  await prisma.favorite.create({ data: { visitorId: VIS, videoId: a.id } });
  await prisma.favorite.create({ data: { visitorId: OTHER, videoId: b.id } });

  const mine = await q.getFavorites(VIS);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].id, a.id);
  assert.equal(await q.isFavorited(VIS, a.id), true);
  assert.equal(await q.isFavorited(VIS, b.id), false);
});

test("收藏按 createdAt 倒序（最近收藏在前）", async () => {
  const a = await makeVideo(prisma, "1", "剧A");
  const b = await makeVideo(prisma, "2", "剧B");
  await prisma.favorite.create({ data: { visitorId: VIS, videoId: a.id, createdAt: new Date(1000) } });
  await prisma.favorite.create({ data: { visitorId: VIS, videoId: b.id, createdAt: new Date(2000) } });

  const favs = await q.getFavorites(VIS);
  assert.deepEqual(favs.map((v) => v.id), [b.id, a.id]);
});

test("历史按 updatedAt 倒序，并带回续播字段", async () => {
  const a = await makeVideo(prisma, "1", "剧A");
  const b = await makeVideo(prisma, "2", "剧B");
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
  const a = await makeVideo(prisma, "1", "剧A");
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
