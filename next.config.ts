import path from "node:path";
import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // HSTS: 2 years, include subdomains. Only effective over HTTPS (ALB/Cloudflare handles TLS).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: path.join(__dirname),
  },
  // ffmpeg-static resolves its binary path via __dirname at import time.
  // Bundling it through Turbopack mangles that path to /ROOT/…, causing
  // ENOENT. Marking both packages as external keeps them as plain
  // require() calls so Node resolves them from node_modules at runtime.
  serverExternalPackages: ["fluent-ffmpeg", "ffmpeg-static"],
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
