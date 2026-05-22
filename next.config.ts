import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // p2p-media-loader 在浏览器用原生 WebRTC；其依赖链(bittorrent-tracker →
  // webrtc-polyfill → node-datachannel)是 Node-only 原生模块，仅在浏览器运行时
  // 动态加载、SSR 不执行。标记为外部，避免服务端打包时解析 .node 失败。
  serverExternalPackages: ["node-datachannel"],
};

export default nextConfig;
