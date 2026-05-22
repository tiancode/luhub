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

export function Player({ lines }: { lines: PlayerLine[] }) {
  const [lineIdx, setLineIdx] = useState(0);
  const [epIdx, setEpIdx] = useState(0);
  const [error, setError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const line = lines[lineIdx];
  const episodes = line?.episodes ?? [];
  const ep = episodes[epIdx];
  const url = ep?.url;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;
    setError(false);

    // 直链（mp4 等）或 Safari 原生 HLS：直接交给 <video>
    if (!isHls(url) || video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      return;
    }

    // 其余浏览器用 hls.js 播放 m3u8
    let hls: HlsType | null = null;
    let cancelled = false;
    import("hls.js").then(({ default: Hls }) => {
      if (cancelled) return;
      if (Hls.isSupported()) {
        hls = new Hls();
        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (data.fatal) setError(true);
        });
        hls.loadSource(url);
        hls.attachMedia(video);
      } else {
        video.src = url;
      }
    });

    return () => {
      cancelled = true;
      hls?.destroy();
    };
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
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-muted hover:text-primary"
          >
            外部打开
          </a>
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
