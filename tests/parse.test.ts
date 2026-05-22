import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlay } from "../src/collect/parse";

test("单线路多集解析", () => {
  const from = "线路A";
  const url =
    "第01集$https://e.com/01.m3u8#第02集$https://e.com/02.m3u8#第03集$https://e.com/03.m3u8";
  const r = parsePlay(from, url);
  assert.equal(r.length, 1);
  assert.equal(r[0].fromName, "线路A");
  assert.equal(r[0].episodes.length, 3);
  assert.equal(r[0].episodes[1].name, "第02集");
  assert.equal(r[0].episodes[1].url, "https://e.com/02.m3u8");
  assert.equal(r[0].episodes[2].sortOrder, 2);
});

test("多线路用 $$$ 分隔且与 from 一一对应", () => {
  const from = "线路A$$$线路B";
  const url =
    "第01集$https://a.com/01.m3u8#第02集$https://a.com/02.m3u8$$$第01集$https://b.com/01.m3u8";
  const r = parsePlay(from, url);
  assert.equal(r.length, 2);
  assert.equal(r[0].fromName, "线路A");
  assert.equal(r[0].episodes.length, 2);
  assert.equal(r[1].fromName, "线路B");
  assert.equal(r[1].episodes.length, 1);
  assert.equal(r[1].episodes[0].url, "https://b.com/01.m3u8");
});

test("from 缺失时回退为 线路N", () => {
  const r = parsePlay(undefined, "正片$https://x.com/v.m3u8");
  assert.equal(r.length, 1);
  assert.equal(r[0].fromName, "线路1");
  assert.equal(r[0].episodes[0].name, "正片");
});

test("过滤非法 URL 的分集", () => {
  const url = "第01集$not-a-url#第02集$https://e.com/02.m3u8";
  const r = parsePlay("线路A", url);
  assert.equal(r[0].episodes.length, 1);
  assert.equal(r[0].episodes[0].url, "https://e.com/02.m3u8");
});

test("空 playUrl 返回空数组", () => {
  assert.deepEqual(parsePlay("线路A", undefined), []);
  assert.deepEqual(parsePlay("线路A", ""), []);
});

test("URL 含 $ 时只按首个 $ 切分名称与地址", () => {
  const url = "第01集$https://e.com/play?token=a$b$c.m3u8";
  const r = parsePlay("线路A", url);
  assert.equal(r[0].episodes[0].name, "第01集");
  assert.equal(r[0].episodes[0].url, "https://e.com/play?token=a$b$c.m3u8");
});
