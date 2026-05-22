import { VideoCard, type VideoCardData } from "./VideoCard";

export function VideoGrid({
  videos,
  emptyText = "暂无内容，换个筛选试试～",
}: {
  videos: VideoCardData[];
  emptyText?: string;
}) {
  if (videos.length === 0) {
    return <div className="py-16 text-center text-muted">{emptyText}</div>;
  }
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
      {videos.map((v) => (
        <VideoCard key={v.id} video={v} />
      ))}
    </div>
  );
}
