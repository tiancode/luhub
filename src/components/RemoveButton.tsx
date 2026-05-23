"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

// 通用「移除」按钮：调用传入的(已 bind videoId 的)Server Action，再刷新当前页。
// 用于「我的」页移除单条收藏/历史。
export function RemoveButton({
  action,
  label = "移除",
  confirm,
  className,
}: {
  action: () => Promise<void>;
  label?: string;
  confirm?: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (confirm && !window.confirm(confirm)) return;
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={
        className ??
        "rounded border border-border px-2 py-0.5 text-xs text-muted hover:border-primary hover:text-foreground disabled:opacity-60"
      }
    >
      {pending ? "…" : label}
    </button>
  );
}
