"use client";

import { useState, useTransition } from "react";
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
            type="button"
            role="radio"
            aria-checked={mine === n}
            aria-label={`${n} 星`}
            disabled={pending}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
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
