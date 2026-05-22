"use client";

import { useEffect, useRef, useState } from "react";
import type HlsType from "hls.js";

export interface PlayerEpisode {
  id: number;
  name: string;
  url: string;
}
export interface PlayerLine {
  id: number;
  fromName: string;
  episodes: PlayerEpisode[];
}

const isHls = (url: string) => /\.m3u8(\?|#|$)/i.test(url);
const P2P_KEY = "luhub_p2p";

export function Player({ lines }: { lines: PlayerLine[] }) {
  const [lineIdx, setLineIdx] = useState(0);
  const [epIdx, setEpIdx] = useState(0);
  const [error, setError] = useState(false);
  const [p2pEnabled, setP2pEnabled] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const prevUrlRef = useRef<string | undefined>(undefined);

  const line = lines[lineIdx];
  const episodes = line?.episodes ?? [];
  const ep = episodes[epIdx];
  const url = ep?.url;

  // 读取持久化的 P2P 偏好（默认开启）。放 effect 里避免 SSR 水合不一致。
  useEffect(() => {
    try {
      if (window.localStorage.getItem(P2P_KEY) === "0") setP2pEnabled(false);
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
    const sameUrl = prevUrlRef.current === url;
    const resumeAt = sameUrl ? video.currentTime : 0;
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
      return;
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
      hls?.destroy();
    };
  }, [url, p2pEnabled]);

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
