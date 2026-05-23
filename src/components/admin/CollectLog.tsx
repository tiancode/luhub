"use client";

import { useEffect, useRef } from "react";

/** 实时采集日志:展示 CollectRun.message;内容更新时自动滚到底部(配合 RunningPoller 轮询刷新)。 */
export function CollectLog({
  text,
  running = false,
}: {
  text: string;
  running?: boolean;
}) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);

  return (
    <pre
      ref={ref}
      className="max-h-48 overflow-auto rounded bg-black/30 border border-border p-2 text-[11px] leading-relaxed text-muted whitespace-pre-wrap break-all"
    >
      {text || (running ? "采集中…(等待首条日志)" : "暂无日志")}
    </pre>
  );
}
