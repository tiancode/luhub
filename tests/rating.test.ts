import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createTempDatabase, setupDb, teardownDb, makeVideo, VIS, OTHER } from "./helpers/db";

// 须在 import prisma 之前设置 DATABASE_URL（prisma 单例在 import 时读取它）。
createTempDatabase("luhub-rating-");

let prisma: typeof import("../src/lib/prisma").prisma;
let q: typeof import("../src/lib/library/queries");
let videos: typeof import("../src/lib/videos");

before(async () => {
  prisma = await setupDb();
  q = await import("../src/lib/library/queries");
  videos = await import("../src/lib/videos");
});

after(() => teardownDb(prisma));

beforeEach(async () => {
  await prisma.rating.deleteMany();
  await prisma.video.deleteMany();
  await prisma.source.deleteMany();
});

test("getMyRating 按访客隔离；未打分返回 0", async () => {
  const a = await makeVideo(prisma, "1", "剧A");
  await prisma.rating.create({ data: { visitorId: VIS, videoId: a.id, score: 4 } });
  await prisma.rating.create({ data: { visitorId: OTHER, videoId: a.id, score: 2 } });

  assert.equal(await q.getMyRating(VIS, a.id), 4);
  assert.equal(await q.getMyRating(OTHER, a.id), 2);
  assert.equal(await q.getMyRating("33333333-3333-4333-8333-333333333333", a.id), 0);
});

test("sort=rating：均分降序，同分时打分人数多的靠前，null 排末尾", async () => {
  const v1 = await makeVideo(prisma, "1", "均分4.5少人", { ratingAvg: 4.5, ratingCount: 2 });
  const v2 = await makeVideo(prisma, "2", "均分4.5多人", { ratingAvg: 4.5, ratingCount: 10 });
  const v3 = await makeVideo(prisma, "3", "均分4.8", { ratingAvg: 4.8, ratingCount: 1 });
  const v4 = await makeVideo(prisma, "4", "无人打分", { ratingAvg: null, ratingCount: 0 });

  const { videos: list } = await videos.getVideoList({ sort: "rating" });
  assert.deepEqual(
    list.map((v) => v.id),
    [v3.id, v2.id, v1.id, v4.id],
  );
});
