import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 必须在 import prisma / idle / store 之前设置 DATABASE_URL：prisma 单例在 import 时读取它。
const dir = mkdtempSync(join(tmpdir(), "luhub-idle-"));
process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
delete process.env.DISABLE_VIDEO_CACHE;
delete process.env.DISABLE_IDLE_CACHE;

let prisma: typeof import("../src/lib/prisma").prisma;
let idle: typeof import("../src/lib/cache/idle");
let store: typeof import("../src/lib/cache/store");

before(async () => {
  // 在临时库上建表（schema 即源），再动态加载读它的模块。
  execFileSync("pnpm", ["exec", "prisma", "db", "push", "--accept-data-loss"], {
    env: process.env,
    stdio: "ignore",
  });
  ({ prisma } = await import("../src/lib/prisma"));
  idle = await import("../src/lib/cache/idle");
  store = await import("../src/lib/cache/store");
});

after(async () => {
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  await prisma.cachedEpisode.deleteMany();
  await prisma.episode.deleteMany();
  await prisma.playSource.deleteMany();
  await prisma.video.deleteMany();
  await prisma.source.deleteMany();
});

interface LineSeed {
  name: string;
  eps: { name: string; url: string }[];
}

async function makeVideo(vodId: string, name: string, lines: LineSeed[]) {
  const source = await prisma.source.upsert({
    where: { name: "test-src" },
    create: { name: "test-src", apiUrl: "http://x" },
    update: {},
  });
  const video = await prisma.video.create({
    data: { sourceId: source.id, sourceVodId: vodId, name },
  });
  for (let li = 0; li < lines.length; li++) {
    const ps = await prisma.playSource.create({
      data: { videoId: video.id, fromName: lines[li].name, sortOrder: li },
    });
    for (let ei = 0; ei < lines[li].eps.length; ei++) {
      await prisma.episode.create({
        data: {
          playSourceId: ps.id,
          name: lines[li].eps[ei].name,
          url: lines[li].eps[ei].url,
          sortOrder: ei,
        },
      });
    }
  }
  return video;
}

test("无任何缓存时挑出一集候选", async () => {
  const v = await makeVideo("1", "剧A", [
    { name: "线路1", eps: [{ name: "第01集", url: "http://e/a1.m3u8" }] },
  ]);
  const c = await idle.selectNextIdleEpisode();
  assert.ok(c);
  assert.equal(c.videoId, v.id);
  assert.equal(c.epName, "第01集");
  assert.equal(c.lineName, "线路1");
});

test("一集一份：某集已 ready，另一线路同集不再被选", async () => {
  const v = await makeVideo("1", "剧A", [
    { name: "线路1", eps: [{ name: "第01集", url: "http://e/a1.m3u8" }] },
    { name: "线路2", eps: [{ name: "第01集", url: "http://e/b1.m3u8" }] },
  ]);
  await prisma.cachedEpisode.create({
    data: { videoId: v.id, lineName: "线路1", epName: "第01集", sourceUrl: "http://e/a1.m3u8", status: "ready" },
  });
  assert.equal(await idle.selectNextIdleEpisode(), null);
});

test("一集一份：某集已 pending（在途），另一线路同集不再被选", async () => {
  const v = await makeVideo("1", "剧A", [
    { name: "线路1", eps: [{ name: "第01集", url: "http://e/a1.m3u8" }] },
    { name: "线路2", eps: [{ name: "第01集", url: "http://e/b1.m3u8" }] },
  ]);
  await prisma.cachedEpisode.create({
    data: { videoId: v.id, lineName: "线路1", epName: "第01集", sourceUrl: "http://e/a1.m3u8", status: "pending" },
  });
  assert.equal(await idle.selectNextIdleEpisode(), null);
});

test("整集所有线路都失败到上限 → 跳过该集（仅此集时返回 null）", async () => {
  const v = await makeVideo("1", "剧A", [
    { name: "线路1", eps: [{ name: "第01集", url: "http://e/a1.m3u8" }] },
    { name: "线路2", eps: [{ name: "第01集", url: "http://e/b1.m3u8" }] },
  ]);
  await prisma.cachedEpisode.createMany({
    data: [
      { videoId: v.id, lineName: "线路1", epName: "第01集", sourceUrl: "http://e/a1.m3u8", status: "failed", attempts: store.MAX_ATTEMPTS },
      { videoId: v.id, lineName: "线路2", epName: "第01集", sourceUrl: "http://e/b1.m3u8", status: "failed", attempts: store.MAX_ATTEMPTS },
    ],
  });
  assert.equal(await idle.selectNextIdleEpisode(), null);
});

test("某线路已耗尽重试 → 只挑该集尚健康的线路", async () => {
  const v = await makeVideo("1", "剧A", [
    { name: "线路1", eps: [{ name: "第01集", url: "http://e/a1.m3u8" }] },
    { name: "线路2", eps: [{ name: "第01集", url: "http://e/b1.m3u8" }] },
  ]);
  await prisma.cachedEpisode.create({
    data: { videoId: v.id, lineName: "线路1", epName: "第01集", sourceUrl: "http://e/a1.m3u8", status: "failed", attempts: store.MAX_ATTEMPTS },
  });
  const c = await idle.selectNextIdleEpisode();
  assert.ok(c);
  assert.equal(c.lineName, "线路2");
});

test("全库都已覆盖 → 返回 null", async () => {
  const v = await makeVideo("1", "剧A", [
    { name: "线路1", eps: [{ name: "第01集", url: "http://e/a1.m3u8" }] },
  ]);
  await prisma.cachedEpisode.create({
    data: { videoId: v.id, lineName: "线路1", epName: "第01集", sourceUrl: "http://e/a1.m3u8", status: "ready" },
  });
  assert.equal(await idle.selectNextIdleEpisode(), null);
});

test("prepareEpisodeCache 一集一份：另一线路已 ready 时跳过、否则建 pending", async () => {
  const v = await makeVideo("1", "剧A", [
    { name: "线路1", eps: [{ name: "第01集", url: "http://e/a1.m3u8" }] },
    { name: "线路2", eps: [{ name: "第01集", url: "http://e/b1.m3u8" }, { name: "第02集", url: "http://e/b2.m3u8" }] },
  ]);
  await prisma.cachedEpisode.create({
    data: { videoId: v.id, lineName: "线路1", epName: "第01集", sourceUrl: "http://e/a1.m3u8", status: "ready" },
  });
  // 第01集已有一份 → 跳过线路2 同集
  const skipped = await store.prepareEpisodeCache({ videoId: v.id, lineName: "线路2", epName: "第01集", url: "http://e/b1.m3u8", sortOrder: 0 });
  assert.equal(skipped, null);
  // 第02集尚无缓存 → 建 pending 并返回 id
  const id = await store.prepareEpisodeCache({ videoId: v.id, lineName: "线路2", epName: "第02集", url: "http://e/b2.m3u8", sortOrder: 1 });
  assert.ok(id);
  const row = await prisma.cachedEpisode.findUnique({ where: { id } });
  assert.equal(row?.status, "pending");
});

test("idleCacheEnabled 默认开启，受 DISABLE_IDLE_CACHE / DISABLE_VIDEO_CACHE 控制", () => {
  const saved = {
    v: process.env.DISABLE_VIDEO_CACHE,
    i: process.env.DISABLE_IDLE_CACHE,
  };
  try {
    delete process.env.DISABLE_VIDEO_CACHE;
    delete process.env.DISABLE_IDLE_CACHE;
    assert.equal(idle.idleCacheEnabled(), true); // 默认开启
    process.env.DISABLE_IDLE_CACHE = "0";
    assert.equal(idle.idleCacheEnabled(), true);
    process.env.DISABLE_IDLE_CACHE = "1";
    assert.equal(idle.idleCacheEnabled(), false);
    process.env.DISABLE_IDLE_CACHE = "0";
    process.env.DISABLE_VIDEO_CACHE = "1";
    assert.equal(idle.idleCacheEnabled(), false);
  } finally {
    if (saved.v === undefined) delete process.env.DISABLE_VIDEO_CACHE;
    else process.env.DISABLE_VIDEO_CACHE = saved.v;
    if (saved.i === undefined) delete process.env.DISABLE_IDLE_CACHE;
    else process.env.DISABLE_IDLE_CACHE = saved.i;
  }
});
