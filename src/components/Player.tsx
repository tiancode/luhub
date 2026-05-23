"use client";

import { useEffect, useRef, useState } from "react";
import type HlsType from "hls.js";
import { requestEpisodeCache } from "@/lib/cache/actions";

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

export function Player({ videoId, lines }: { videoId: number; lines: PlayerLine[] }) {
  const [lineIdx, setLineIdx] = useState(0);
  const [epIdx, setEpIdx] = useState(0);
  const [error, setError] = useState(false);
  const [p2pEnabled, setP2pEnabled] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const prevUrlRef = useRef<string | undefined>(undefined);
  const resumeRef = useRef(0);

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

    // 仅当因切换 P2P 开关而重建（url 未变）时续播，避免换集从头开始。
    // 进度在上一次清理（destroy 前）已存入 resumeRef；换集时 url 变 → 不续播。
    const sameUrl = prevUrlRef.current === url;
    const resumeAt = sameUrl ? resumeRef.current : 0;
    prevUrlRef.current = url;

    const tryPlay = () => {
      if (resumeAt > 0) {
        try {
          video.currentTime = resumeAt;
        } catch {}
      }
      void video.play().catch(() => {});
    };

    // 直链（mp4 等）或 Safari 原生 HLS：直接交给 <video>（P2P 仅作用于 hls.js）
    if (!isHls(url) || video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      tryPlay();
      return () => {
        resumeRef.current = video.currentTime;
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
      resumeRef.current = video.currentTime; // 在 destroy 重置前抓住进度
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
      void requestEpisodeCache({ videoId, lineName, epName, url }).catch(() => {});
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
        {episodes.map((e, i) => (
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
        ))}
      </div>
    </div>
  );
}
