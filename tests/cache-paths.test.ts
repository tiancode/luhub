import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeSegment, buildEpisodePath, isHls } from "../src/lib/cache/paths";

test("sanitizeSegment 保留中文与连字符，替换非法字符", () => {
  assert.equal(sanitizeSegment("长安谜案"), "长安谜案");
  assert.equal(sanitizeSegment("Spider-Man"), "Spider-Man");
  assert.equal(sanitizeSegment('a/b\\c:d*e?f"g<h>i|j'), "a b c d e f g h i j");
});

test("sanitizeSegment 折叠空白、去首尾点、空回退", () => {
  assert.equal(sanitizeSegment("  第  01  集  "), "第 01 集");
  assert.equal(sanitizeSegment("...隐藏..."), "隐藏");
  assert.equal(sanitizeSegment(""), "未命名");
  assert.equal(sanitizeSegment("///", "线路"), "线路");
});

test("buildEpisodePath 生成人类可读 relPath 与编码后的 localUrl", () => {
  const p = buildEpisodePath({
    groupLabel: "电视剧",
    name: "长安谜案",
    year: 2025,
    lineName: "线路A",
    epName: "第01集",
  });
  assert.equal(p.relPath, "电视剧/长安谜案 (2025)/线路A/第01集.mp4");
  assert.equal(
    p.localUrl,
    "/videos/" +
      [
        "电视剧",
        "长安谜案 (2025)",
        "线路A",
        "第01集.mp4",
      ]
        .map(encodeURIComponent)
        .join("/"),
  );
  assert.ok(p.absFile.endsWith("第01集.mp4"));
  assert.ok(p.absFile.startsWith(p.absDir));
});

test("buildEpisodePath 无年份/无分类时回退", () => {
  const p = buildEpisodePath({ groupLabel: "", name: "正片", lineName: "", epName: "" });
  assert.equal(p.relPath, "未分类/正片/线路/未命名.mp4");
});

test("isHls 识别 m3u8", () => {
  assert.equal(isHls("https://e.com/a/01.m3u8"), true);
  assert.equal(isHls("https://e.com/a/01.m3u8?token=x"), true);
  assert.equal(isHls("https://e.com/a/01.mp4"), false);
});
