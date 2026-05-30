import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// resolveOrder 是纯函数，但 videos.ts 会 import prisma 单例（import 时读 DATABASE_URL）。
// 指向临时库即可，本测试不发查询。
process.env.DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), "luhub-sort-")), "x.db")}`;

let resolveOrder: typeof import("../src/lib/videos").resolveOrder;

before(async () => {
  ({ resolveOrder } = await import("../src/lib/videos"));
});

const LATEST = [{ releasedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }];

test("默认 / 空 / 未知 key 一律回落到 latest（防注入到任意字段）", () => {
  assert.deepEqual(resolveOrder(undefined), LATEST);
  assert.deepEqual(resolveOrder(""), LATEST);
  assert.deepEqual(resolveOrder("bogus"), LATEST);
  assert.deepEqual(resolveOrder("'; DROP TABLE Video; --"), LATEST);
});

test("rating 按 ratingAvg 降序，ratingCount 作次级权重", () => {
  const o = resolveOrder("rating");
  assert.deepEqual(o[0], { ratingAvg: { sort: "desc", nulls: "last" } });
  assert.deepEqual(o[1], { ratingCount: "desc" });
  assert.deepEqual(o[2], { id: "desc" });
});

test("added 按 createdAt 降序", () => {
  const o = resolveOrder("added");
  assert.deepEqual(o[0], { createdAt: "desc" });
});
