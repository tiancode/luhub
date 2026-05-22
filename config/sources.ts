// 资源站（采集来源）配置 —— 由部署者自行填入符合 maccms V10 标准的资源接口。
//
// 注意：采集后台（/admin）以数据库中的资源站为准；此文件仅供 `pnpm collect` CLI / CI 使用。
//
// 接口约定（maccms V10）:
//   端点:  https://站点/api.php/provide/vod/
//   参数:  ac=detail（含播放地址）| ac=list（仅元数据）、t=分类id、pg=页码、
//          wd=关键词、h=最近 h 小时内更新（增量）、at=json（强制 JSON）
//   响应:  { code, msg, page, pagecount, limit, total, class[], list[] }
//
// 合规提示: 聚合/采集涉及版权，请仅采集你有权使用的资源，遵守对方 robots 与服务条款。

export type SourceKind = "maccms_json" | "maccms_xml" | "html";

export interface SourceConfig {
  /** 唯一名称，作为 DB 主键标识 */
  name: string;
  /** 采集接口地址（maccms 为 provide/vod 端点；html 为站点根） */
  apiUrl: string;
  kind: SourceKind;
  enabled?: boolean;
}

export const SOURCES: SourceConfig[] = [
  // 示例（请替换为你自己的资源站地址后启用）:
  // {
  //   name: "示例资源站",
  //   apiUrl: "https://example-cms.com/api.php/provide/vod/",
  //   kind: "maccms_json",
  //   enabled: true,
  // },
];

export function getSource(name: string): SourceConfig | undefined {
  return SOURCES.find((s) => s.name === name);
}
