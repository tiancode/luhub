import type { HtmlAdapter } from "./adapter";
import type { MaccmsResponse } from "../types";

/**
 * 通用 HTML 采集适配器 —— 骨架。
 *
 * 站点 URL 语义（示例）:
 *   列表:  /list/?country=jp&year=2025&genre=dong-zuo&page=2
 *   详情:  /vod/<ID>.html
 *   最近更新: /latest/
 *
 * 本文件仅提供结构与限速骨架；具体 DOM 选择器需按实际页面填充
 * （建议用 cheerio 等解析）。HTML 采集易随改版失效，仅作补充。
 */
const RATE_LIMIT_MS = 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ExampleHtmlAdapter implements HtmlAdapter {
  name = "example";
  baseUrl = "https://example.com";

  async fetchListPage(params: {
    country?: string;
    genre?: string;
    year?: string;
    page: number;
  }): Promise<MaccmsResponse> {
    const url = new URL("/list/", this.baseUrl);
    if (params.country) url.searchParams.set("country", params.country);
    if (params.genre) url.searchParams.set("genre", params.genre);
    if (params.year) url.searchParams.set("year", params.year);
    url.searchParams.set("page", String(params.page));

    await sleep(RATE_LIMIT_MS); // 限速
    // TODO: fetch(url) -> 用 cheerio 解析卡片(标题/封面/vod链接/更新备注)，
    //       归一化为 MaccmsResponse{ class:[{type_id, type_name:"动漫"}], list:[{vod_id, vod_name, vod_pic, vod_remarks, type_id, ...}] }
    //       详情页 /vod/<ID>.html 再解析 m3u8 播放地址填入 vod_play_from / vod_play_url。
    throw new Error(
      `ExampleHtmlAdapter.fetchListPage 尚未实现（骨架）。URL=${url.toString()}`,
    );
  }
}
