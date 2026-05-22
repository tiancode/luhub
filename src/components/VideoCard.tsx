import Link from "next/link";

export interface VideoCardData {
  id: number;
  name: string;
  pic: string | null;
  remarks: string | null;
  year: number | null;
  area: string | null;
}

export function VideoCard({ video }: { video: VideoCardData }) {
  return (
    <Link
      href={`/vod/${video.id}`}
      className="group block rounded-lg overflow-hidden bg-surface border border-border hover:border-primary transition-colors"
    >
      <div className="relative aspect-[2/3] bg-surface-2 overflow-hidden">
        {video.pic ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.pic}
            alt={video.name}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted text-sm">
            无封面
          </div>
        )}
        {video.remarks && (
          <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-[11px] text-white">
            {video.remarks}
          </span>
        )}
      </div>
      <div className="p-2">
        <h3 className="text-sm font-medium truncate group-hover:text-primary">
          {video.name}
        </h3>
        <p className="text-xs text-muted truncate">
          {[video.year, video.area].filter(Boolean).join(" · ") || " "}
        </p>
      </div>
    </Link>
  );
}
