/**
 * GET /api/proxy-image?url=<encoded-url>
 *
 * Server-side image proxy — fetches a remote image and streams it back,
 * bypassing browser CORS and hotlink restrictions. Used for BytePlus asset
 * previews whose CDN may not send Access-Control-Allow-Origin headers.
 */

import { request as httpsRequest } from "node:https";
import { request as httpRequest, type IncomingMessage } from "node:http";
import type { NextRequest } from "next/server";
import { assertSafeUrl } from "@/lib/server/url-guard";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB ceiling

function fetchRemote(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try { parsed = new URL(url); } catch { reject(new Error("invalid url")); return; }

    const isHttps = parsed.protocol === "https:";
    const reqFn = isHttps ? httpsRequest : httpRequest;

    const req = reqFn(
      {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; LumenHub/1.0)",
          Accept: "image/*,*/*;q=0.8",
        },
        rejectUnauthorized: false,
        timeout: 15_000,
      },
      (res: IncomingMessage) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          fetchRemote(new URL(res.headers.location, url).toString()).then(resolve).catch(reject);
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`HTTP ${status}`));
          return;
        }
        const chunks: Buffer[] = [];
        let total = 0;
        res.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > MAX_BYTES) { req.destroy(); reject(new Error("image too large")); return; }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({
          buffer: Buffer.concat(chunks),
          contentType: (res.headers["content-type"] ?? "image/jpeg").split(";")[0].trim(),
        }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.on("error", reject);
    req.end();
  });
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url");
  if (!raw) return new Response("missing url", { status: 400 });

  let url: URL;
  try { url = new URL(raw); } catch { return new Response("invalid url", { status: 400 }); }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return new Response("http/https only", { status: 400 });
  }
  try { assertSafeUrl(url); } catch { return new Response("blocked", { status: 403 }); }

  try {
    const { buffer, contentType } = await fetchRemote(raw);
    return new Response(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "fetch failed";
    return new Response(msg, { status: 502 });
  }
}
