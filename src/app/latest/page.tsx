import type { Metadata } from "next";
import { getLatest, PAGE_SIZE } from "@/lib/videos";
import { VideoGrid } from "@/components/VideoGrid";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "最近更新" };

export default async function LatestPage() {
  const videos = await getLatest(PAGE_SIZE * 2);
  return (
    <div>
      <h1 className="text-xl font-bold mb-4">最近更新</h1>
      <VideoGrid videos={videos} />
    </div>
  );
}
