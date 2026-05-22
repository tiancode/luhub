"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** 有采集任务在运行时，周期性刷新当前页以反映最新状态。 */
export function RunningPoller({ intervalMs = 3000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [router, intervalMs]);
  return null;
}
