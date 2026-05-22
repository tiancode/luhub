import type { MaccmsResponse } from "../types";

/**
 * HTML 站点采集适配器接口。
 * 无标准 maccms 接口的站点通过实现该接口，把抓取结果
 * 归一化为 maccms 形状的 {@link MaccmsResponse}，从而复用 `ingestResponse` 入库。
 *
 * 注意: HTML 采集对页面改版敏感，仅作补充手段；务必限速并尊重对方 robots。
 */
export interface HtmlAdapter {
  name: string;
  baseUrl: string;
  /** 抓取分类列表的一页，归一化为 maccms 响应（含 class[] 与 list[]） */
  fetchListPage(params: {
    country?: string;
    genre?: string;
    year?: string;
    page: number;
  }): Promise<MaccmsResponse>;
}
