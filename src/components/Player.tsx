"use client";

import { useEffect, useRef, useState } from "react";
import type HlsType from "hls.js";
import { requestEpisodeCache } from "@/lib/cache/actions";
import { recordHistory } from "@/lib/library/actions";

export interface PlayerEpisode {
  id: number;
  name: string;
  url: string;
}
export interface PlayerLine {
  id: number;
  fromName: string;
  episodes: PlayerEpisode[];
  cached?: boolean; // 合成的「缓存线路」：本地文件，不再回缓
}

const isHls = (url: string) => /\.m3u8(\?|#|$)/i.test(url);
const P2P_KEY = "luhub_p2p";
// 看够这么多秒（或看完）才通知服务端缓存：只缓存真正在看的，避免快速点选时把路过的剧集排进队列。
const CACHE_TRIGGER_SECONDS = 15;
// 观看历史：看够这么多秒才开始记（过滤误点），并每隔 INTERVAL 节流上报一次进度。
const HISTORY_MIN_SECONDS = 5;
const HISTORY_INTERVAL_MS = 10_000;

export function Player({
  videoId,
  lines,
  initialLineIdx = 0,
  initialEpIdx = 0,
  resumePosition = 0,
  reverseEpisodes = false,
}: {
  videoId: number;
  lines: PlayerLine[];
  initialLineIdx?: number;
  initialEpIdx?: number;
  resumePosition?: number;
  reverseEpisodes?: boolean; // 番剧等倒序展示集数（最新一集在前）；仅改展示顺序，索引仍为真实集序
}) {
  const [lineIdx, setLineIdx] = useState(initialLineIdx);
  const [epIdx, setEpIdx] = useState(initialEpIdx);
  const [error, setError] = useState(false);
  const [p2pEnabled, setP2pEnabled] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const prevUrlRef = useRef<string | undefined>(undefined);
  // 当前 url 期望续播到的位置：初值=历史续播点（首集生效），之后由清理时的 currentTime 维护（P2P 重建续上）。
  const resumeRef = useRef(resumePosition);

  const line = lines[lineIdx];
  const episodes = line?.episodes ?? [];
  const ep = episodes[epIdx];
  const url = ep?.url;

  // 读取持久化的 P2P 偏好（默认开启）。放 effect 里避免 SSR 水合不一致：
  // 服务端按默认渲染，客户端挂载后再校正——这正是该规则的合理例外。
  useEffect(() => {
    try {
      if (window.localStorage.getItem(P2P_KEY) === "0") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setP2pEnabled(false);
      }
    } catch {}
  }, []);

  function toggleP2p() {
    setP2pEnabled((on) => {
      const next = !on;
      try {
        window.localStorage.setItem(P2P_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;
    setError(false);

    // 续播位置：同一 url(仅因切 P2P 而重建) → 接上次进度；首次挂载(首集) → 历史续播点；
    // 换到别的集 → 从头(0)。进度在上一次清理（destroy 前）已存入 resumeRef。
    const sameUrl = prevUrlRef.current === url;
    const firstMount = prevUrlRef.current === undefined;
    // 真正换集：清掉上一集残留的续播点，免得随后在本集 currentTime 还是 0 时切 P2P，
    // 被 cleanup 的 >0 守卫保住旧值、重建时误跳到上一集的进度。
    if (!sameUrl && !firstMount) resumeRef.current = 0;
    const resumeAt = sameUrl || firstMount ? resumeRef.current : 0;
    prevUrlRef.current = url;

    // 元数据未就绪时直接设 currentTime 会被忽略，故挂 loadedmetadata 等就绪再 seek；
    // <video> 元素跨集复用，故该监听必须在 cleanup 里摘掉——否则切集后旧监听会把新集跳到旧进度。
    let metaSeek: (() => void) | null = null;
    const tryPlay = () => {
      if (resumeAt > 0) {
        const seek = () => {
          try {
            video.currentTime = resumeAt;
          } catch {}
        };
        if (video.readyState >= 1) seek();
        else {
          metaSeek = seek;
          video.addEventListener("loadedmetadata", seek, { once: true });
        }
      }
      void video.play().catch(() => {});
    };
    const clearMetaSeek = () => {
      if (metaSeek) video.removeEventListener("loadedmetadata", metaSeek);
    };

    // 直链（mp4 等）或 Safari 原生 HLS：直接交给 <video>（P2P 仅作用于 hls.js）
    if (!isHls(url) || video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      tryPlay();
      return () => {
        clearMetaSeek();
        // >0 守卫：若续播 seek 尚未生效（currentTime 仍为 0），别把 resumeRef 覆盖成 0，
        // 否则 P2P 重建会丢掉历史续播点。
        if (video.currentTime > 0) resumeRef.current = video.currentTime;
      };
    }

    let hls: HlsType | null = null;
    let cancelled = false;

    (async () => {
      const { default: Hls } = await import("hls.js");
      if (cancelled) return;
      if (!Hls.isSupported()) {
        video.src = url;
        tryPlay();
        return;
      }

      if (p2pEnabled) {
        // P2P 加速：分片优先从 WebRTC 对等端获取，取不到回源 HTTP。
        // 同一播放地址 = 同一 swarm（默认按 manifest URL 归组），看同片的人互相提速。
        const { HlsJsP2PEngine } = await import("p2p-media-loader-hlsjs");
        if (cancelled) return;
        const HlsWithP2P = HlsJsP2PEngine.injectMixin(Hls);
        hls = new HlsWithP2P({ p2p: { core: {} } }) as unknown as HlsType;
      } else {
        hls = new Hls();
      }

      hls.on(Hls.Events.MANIFEST_PARSED, tryPlay);
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) setError(true);
      });
      hls.loadSource(url);
      hls.attachMedia(video);
    })();

    return () => {
      cancelled = true;
      clearMetaSeek();
      if (video.currentTime > 0) resumeRef.current = video.currentTime; // destroy 重置前抓进度（同上守卫）
      hls?.destroy();
    };
  }, [url, p2pEnabled]);

  // 「看够再缓存」：监听播放进度，看到 CACHE_TRIGGER_SECONDS 秒（或看完）才通知服务端缓存。
  // 快速点选路过的剧集进度还没到阈值就被切走（url 变 → 清理监听），因此不会被排队下载，
  // 只缓存用户真正在看的那一集。失败静默；服务端自身幂等去重。
  useEffect(() => {
    if (!url || !line || !ep || line.cached) return;
    if (!/^https?:\/\//i.test(url)) return;
    const video = videoRef.current;
    if (!video) return;
    const lineName = line.fromName;
    const epName = ep.name;

    let fired = false;
    function trigger() {
      if (fired) return;
      fired = true;
      video!.removeEventListener("timeupdate", onTime);
      video!.removeEventListener("ended", trigger);
      void requestEpisodeCache({ videoId, lineName, epName }).catch(() => {});
    }
    function onTime() {
      if (video!.currentTime >= CACHE_TRIGGER_SECONDS) trigger();
    }
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("ended", trigger); // 短于阈值的片子看完也缓存
    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("ended", trigger);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // 观看历史 + 续播进度上报：看够 HISTORY_MIN_SECONDS 秒才开始记，节流每 HISTORY_INTERVAL_MS 上报一次，
  // 暂停/看完/切集/卸载各补记一次。进度存进闭包变量(由 timeupdate 维护)，不在清理时读 currentTime——
  // 避免清理顺序里 hls.destroy 已把 currentTime 重置为 0 导致记成 0、覆盖掉真实续播点。
  useEffect(() => {
    if (!url || !line || !ep) return;
    const video = videoRef.current;
    if (!video) return;
    const lineName = line.fromName;
    const epName = ep.name;
    const curEp = epIdx;

    let lastPos = 0;
    let lastDur: number | null = null;
    let lastSent = 0;

    const send = (force: boolean) => {
      if (lastPos < HISTORY_MIN_SECONDS) return; // 看太短不记，过滤误点
      const now = Date.now();
      if (!force && now - lastSent < HISTORY_INTERVAL_MS) return;
      lastSent = now;
      void recordHistory({
        videoId,
        lineName,
        epName,
        epIndex: curEp,
        position: lastPos,
        duration: lastDur,
      }).catch(() => {});
    };

    const onTime = () => {
      if (video.currentTime > 0) lastPos = video.currentTime;
      if (Number.isFinite(video.duration) && video.duration > 0) lastDur = video.duration;
      send(false);
    };
    const onPause = () => send(true);

    video.addEventListener("timeupdate", onTime);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onPause);
    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onPause);
      send(true); // 切集/卸载补记最终进度
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  function selectLine(i: number) {
    setLineIdx(i);
    setEpIdx((cur) => Math.min(cur, (lines[i]?.episodes.length ?? 1) - 1));
  }

  return (
    <div className="space-y-4">
      <div className="aspect-video w-full overflow-hidden rounded-lg border border-border bg-black">
        {url ? (
          <video
            ref={videoRef}
            controls
            autoPlay
            playsInline
            onError={() => setError(true)}
            className="h-full w-full"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted">
            暂无播放资源
          </div>
        )}
      </div>

      {url && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="truncate text-muted">
            正在播放：{line?.fromName} · {ep?.name}
          </span>
          <div className="flex shrink-0 items-center gap-3">
            {isHls(url) && (
              <button
                type="button"
                onClick={toggleP2p}
                aria-pressed={p2pEnabled}
                title="P2P 加速：与正在看同一视频的人互相分担流量。关闭后仅走源站。"
                className={`rounded border px-2 py-1 text-xs transition-colors ${
                  p2pEnabled
                    ? "border-primary text-primary"
                    : "border-border text-muted hover:text-foreground"
                }`}
              >
                P2P 加速：{p2pEnabled ? "开" : "关"}
              </button>
            )}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted hover:text-primary"
            >
              外部打开
            </a>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-primary">
          该地址无法直接播放，可点击“外部打开”，或切换其他线路 / 剧集。
        </p>
      )}

      {lines.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {lines.map((l, i) => (
            <button
              key={l.id}
              type="button"
              onClick={() => selectLine(i)}
              className={`rounded border px-3 py-1.5 text-sm transition-colors ${
                i === lineIdx
                  ? "border-primary bg-primary text-white"
                  : "border-border text-muted hover:border-primary hover:text-foreground"
              }`}
            >
              {l.fromName}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-8">
        {(reverseEpisodes
          ? episodes.map((_, i) => episodes.length - 1 - i)
          : episodes.map((_, i) => i)
        ).map((i) => {
          const e = episodes[i];
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => setEpIdx(i)}
              title={e.name}
              className={`truncate rounded border px-2 py-1.5 text-center text-sm transition-colors ${
                i === epIdx
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-surface text-muted hover:border-primary hover:text-foreground"
              }`}
            >
              {e.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
