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
  // These routes read the bundled Seedance skill's reference docs from disk at
  // runtime. Standalone output traces only statically-imported files, so
  // force-include the markdown into the build.
  outputFileTracingIncludes: {
    "/api/optimize-prompt": ["./claude_skill/references/**/*.md"],
    "/api/article-to-prompt": ["./claude_skill/references/**/*.md"],
    // The Seed prompt-writing routes read the same docs. Miss one of these and
    // the grounding silently degrades to the bare system prompt in a
    // standalone build — the loader fails soft by design.
    "/api/story/[id]/generate-prompts": ["./claude_skill/references/**/*.md"],
    "/api/story/generate-shots": ["./claude_skill/references/**/*.md"],
    "/api/story/[id]/breakdown": ["./claude_skill/references/**/*.md"],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
