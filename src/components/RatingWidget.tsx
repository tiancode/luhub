"use client";

import { useRef, useState, useTransition } from "react";
import { rateVideo, type RatingResult } from "@/lib/library/actions";

// 访客打分：5 星，乐观更新后与服务端返回的均分/人数对齐;失败回滚。
export function RatingWidget({
  videoId,
  initialMine,
  initialAvg,
  initialCount,
}: {
  videoId: number;
  initialMine: number; // 0=未打分
  initialAvg: number | null;
  initialCount: number;
}) {
  const [mine, setMine] = useState(initialMine);
  const [avg, setAvg] = useState(initialAvg);
  const [count, setCount] = useState(initialCount);
  const [hover, setHover] = useState(0);
  const [pending, startTransition] = useTransition();
  const starRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // 方向键在 5 颗星间移动焦点（不直接提交，由 Enter/Space 触发 onClick）。
  function onKeyDown(e: React.KeyboardEvent, n: number) {
    let to = n;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") to = Math.min(5, n + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") to = Math.max(1, n - 1);
    else return;
    e.preventDefault();
    starRefs.current[to - 1]?.focus();
  }

  function rate(score: number) {
    if (pending) return;
    const prev: RatingResult = { mine, avg, count };
    setMine(score); // 乐观
    startTransition(async () => {
      try {
        const res = await rateVideo(videoId, score);
        if (res) {
          setMine(res.mine);
          setAvg(res.avg);
          setCount(res.count);
        } else {
          throw new Error("rate failed");
        }
      } catch {
        setMine(prev.mine); // 回滚
        setAvg(prev.avg);
        setCount(prev.count);
      }
    });
  }

  const shown = hover || mine;

  return (
    <div className="flex items-center gap-2">
      <div className="flex" role="radiogroup" aria-label="给这部影片打分">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            ref={(el) => {
              starRefs.current[n - 1] = el;
            }}
            type="button"
            role="radio"
            aria-checked={mine === n}
            aria-label={`${n} 星`}
            // 漫游 tabindex：组内只留一个 tab 停靠点（选中项，未打分则首颗）。
            tabIndex={n === (mine || 1) ? 0 : -1}
            disabled={pending}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onKeyDown={(e) => onKeyDown(e, n)}
            onClick={() => rate(n)}
            className={`px-0.5 text-xl leading-none transition-colors disabled:opacity-60 ${
              n <= shown ? "text-amber-400" : "text-border hover:text-amber-400/60"
            }`}
          >
            {n <= shown ? "★" : "☆"}
          </button>
        ))}
      </div>
      <span className="text-sm text-muted">
        {avg != null ? (
          <>
            <span className="text-foreground font-medium">{avg.toFixed(1)}</span> 分 · {count} 人
          </>
        ) : (
          "暂无评分"
        )}
        {mine > 0 && <span className="ml-1">(我打了 {mine} 星)</span>}
      </span>
    </div>
  );
}
