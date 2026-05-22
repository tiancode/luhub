const MAP: Record<string, { label: string; cls: string }> = {
  running: { label: "采集中", cls: "bg-primary/20 text-primary" },
  success: { label: "成功", cls: "bg-green-500/15 text-green-400" },
  failed: { label: "失败", cls: "bg-red-500/15 text-red-400" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = MAP[status] ?? { label: status, cls: "bg-surface-2 text-muted" };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs ${s.cls}`}>
      {s.label}
    </span>
  );
}
