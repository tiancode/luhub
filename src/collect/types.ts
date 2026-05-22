/// maccms V10 采集接口的数据结构

export interface MaccmsClass {
  type_id: number | string;
  type_pid?: number | string;
  type_name: string;
}

export interface MaccmsVod {
  vod_id: number | string;
  vod_name: string;
  type_id?: number | string;
  type_name?: string;
  vod_pic?: string;
  vod_remarks?: string;
  vod_time?: string;
  vod_play_from?: string;
  vod_play_url?: string;
  vod_content?: string;
  vod_year?: string | number;
  vod_area?: string;
  vod_lang?: string;
  vod_actor?: string;
  vod_director?: string;
  vod_score?: string | number;
}

export interface MaccmsResponse {
  code?: number;
  msg?: string;
  page?: number | string;
  pagecount?: number;
  limit?: number | string;
  total?: number;
  class?: MaccmsClass[];
  list?: MaccmsVod[];
}

export interface ParsedEpisode {
  name: string;
  url: string;
  sortOrder: number;
}

export interface ParsedPlaySource {
  fromName: string;
  sortOrder: number;
  episodes: ParsedEpisode[];
}
