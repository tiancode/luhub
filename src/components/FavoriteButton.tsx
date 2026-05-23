"use client";

import { useState, useTransition } from "react";
import { toggleFavorite } from "@/lib/library/actions";

// 收藏按钮：乐观切换，再与服务端返回的真实状态对齐;失败回滚。
export function FavoriteButton({ videoId, initial }: { videoId: number; initial: boolean }) {
  const [fav, setFav] = useState(initial);
  const [pending, startTransition] = useTransition();

  function onClick() {
    setFav((v) => !v); // 乐观
    startTransition(async () => {
      try {
        setFav(await toggleFavorite(videoId));
      } catch {
        setFav((v) => !v); // 回滚
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={fav}
      className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors disabled:opacity-60 ${
        fav
          ? "border-primary bg-primary text-white"
          : "border-border text-muted hover:border-primary hover:text-foreground"
      }`}
    >
      <span aria-hidden>{fav ? "★" : "☆"}</span>
      {fav ? "已收藏" : "收藏"}
    </button>
  );
}
