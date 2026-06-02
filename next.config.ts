import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  turbopack: {
    root: path.join(__dirname),
  },
  // ffmpeg-static resolves its binary path via __dirname at import time.
  // Bundling it through Turbopack mangles that path to /ROOT/…, causing
  // ENOENT. Marking both packages as external keeps them as plain
  // require() calls so Node resolves them from node_modules at runtime.
  serverExternalPackages: ["fluent-ffmpeg", "ffmpeg-static"],
};

export default nextConfig;
