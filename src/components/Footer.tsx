import { SITE_NAME } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface mt-10">
      <div className="max-w-screen-xl mx-auto px-4 py-6 text-xs text-muted space-y-2">
        <p>
          {SITE_NAME} 仅作为影视资源聚合的索引与展示，所有视频内容均来自第三方资源站，
          本站不存储、不上传、不制作任何音视频文件。
        </p>
        <p>
          如内容侵犯了您的权益，请联系来源站点处理。请支持正版，影视作品版权归原作者及版权方所有。
        </p>
        <p>© {new Date().getFullYear()} {SITE_NAME}</p>
      </div>
    </footer>
  );
}
