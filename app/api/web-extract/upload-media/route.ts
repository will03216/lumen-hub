/**
 * POST /api/web-extract/upload-media
 *
 * Downloads a media URL, uploads the bytes to BytePlus TOS, registers a
 * BytePlus ModelArk asset in the "Web Extracts" group, polls until Active.
 * Returns: { assetId, tosUrl, groupId, kind }
 *
 * Uses Node.js https/http directly (not global fetch) so we can set
 * rejectUnauthorized: false — many CDN images use certificate chains that
 * pass browsers but fail Node's stricter TLS validation, causing the
 * generic "fetch failed" error when using global fetch.
 */

import { request as httpsRequest } from "node:https";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { assertSafeUrl } from "@/lib/server/url-guard";
import type { NextRequest } from "next/server";
import {
  uploadToTos,
  createAsset,
  getAsset,
  listAllAssetGroups,
  createAssetGroup,
} from "@/lib/modelark";

export const runtime = "nodejs";
export const maxDuration = 60;

const DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_BYTES = 50 * 1024 * 1024;
const POLL_MAX = 30;

let cachedGroupId: string | null = null;

async function getOrCreateWebExtractsGroup(): Promise<string> {
  if (cachedGroupId) return cachedGroupId;
  const groups = await listAllAssetGroups();
  const existing = groups.find((g) => g.name === "Web Extracts");
  if (existing) { cachedGroupId = existing.groupId; return existing.groupId; }
  const created = await createAssetGroup("Web Extracts", "Assets imported from web pages via the Web Extract canvas node");
  cachedGroupId = created.groupId;
  return created.groupId;
}

// ── Downloader using node:https (bypasses Node's strict TLS validation) ──────

function downloadViaNodeHttp(
  url: string,
  headers: Record<string, string>,
  redirectsLeft = 5,
): Promise<{ buffer: Buffer; contentType: string; status: number }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const reqFn = isHttps ? httpsRequest : httpRequest;

    const req = reqFn(
      {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: "GET",
        headers,
        rejectUnauthorized: false,   // accept CDN certs that fail Node's chain validation
        timeout: DOWNLOAD_TIMEOUT_MS,
      },
      (res: IncomingMessage) => {
        const status = res.statusCode ?? 0;

        // Follow redirects
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) { reject(new Error("Too many redirects")); return; }
          const nextUrl = new URL(res.headers.location, url);
          try { assertSafeUrl(nextUrl); } catch (e) { reject(e); return; }
          downloadViaNodeHttp(nextUrl.toString(), headers, redirectsLeft - 1).then(resolve).catch(reject);
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
          if (total > MAX_BYTES) { req.destroy(); reject(new Error("media exceeds 50 MB limit")); return; }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({
          buffer: Buffer.concat(chunks),
          contentType: (res.headers["content-type"] ?? "").split(";")[0].trim() || "image/jpeg",
          status,
        }));
        res.on("error", reject);
      },
    );

    req.on("timeout", () => { req.destroy(); reject(new Error("download timed out")); });
    req.on("error", reject);
    req.end();
  });
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  console.log("[upload-media] POST received");
  let body: { url?: unknown; kind?: unknown; pageUrl?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  console.log("[upload-media] body:", JSON.stringify(body).slice(0, 200));

  const url = typeof body.url === "string" ? body.url.trim() : "";
  const kind = body.kind === "video" ? "video" : "image";
  const pageUrl = typeof body.pageUrl === "string" ? body.pageUrl.trim() : "";

  if (!url) return Response.json({ error: "url is required" }, { status: 400 });

  let parsed: URL;
  try { parsed = new URL(url); } catch {
    return Response.json({ error: "invalid url" }, { status: 400 });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return Response.json({ error: "http/https only" }, { status: 400 });
  }
  try { assertSafeUrl(parsed); } catch { return Response.json({ error: "blocked" }, { status: 403 }); }

  // ── 1. Download ────────────────────────────────────────────────────────────
  const downloadHeaders: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: kind === "video" ? "video/*,*/*;q=0.8" : "image/webp,image/png,image/jpeg,image/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
  };
  if (pageUrl) downloadHeaders["Referer"] = pageUrl;

  let fileBuffer: Buffer;
  let contentType: string;
  try {
    console.log("[upload-media] downloading:", url);
    const result = await downloadViaNodeHttp(url, downloadHeaders);
    fileBuffer = result.buffer;
    contentType = result.contentType;
    console.log("[upload-media] downloaded ok, bytes:", fileBuffer.length, "type:", contentType);
  } catch (err) {
    console.error("[upload-media] download error:", err);
    const msg = err instanceof Error ? err.message : "download failed";
    return Response.json({ error: `Could not download image: ${msg}` }, { status: 502 });
  }

  // ── 2. Upload to TOS ───────────────────────────────────────────────────────
  const rawFilename = parsed.pathname.split("/").filter(Boolean).pop()?.split("?")[0]
    ?? `web-extract.${kind === "video" ? "mp4" : "jpg"}`;
  const filename = rawFilename || `asset.${kind === "video" ? "mp4" : "jpg"}`;

  let tosUrl: string;
  try {
    console.log("[upload-media] uploading to TOS, filename:", filename);
    tosUrl = await uploadToTos(fileBuffer, contentType, filename);
    console.log("[upload-media] TOS url:", tosUrl);
  } catch (err) {
    console.error("[upload-media] TOS upload error:", err);
    const msg = err instanceof Error ? err.message : "TOS upload failed";
    return Response.json({ error: msg }, { status: 500 });
  }

  // ── 3. Get/create "Web Extracts" group ────────────────────────────────────
  let groupId: string;
  try {
    console.log("[upload-media] getting web-extracts group");
    groupId = await getOrCreateWebExtractsGroup();
    console.log("[upload-media] groupId:", groupId);
  } catch (err) {
    console.error("[upload-media] group error:", err);
    const msg = err instanceof Error ? err.message : "group lookup failed";
    return Response.json({ error: msg }, { status: 500 });
  }

  // ── 4. Register with BytePlus ModelArk ────────────────────────────────────
  let assetId: string;
  try {
    console.log("[upload-media] registering asset");
    assetId = await createAsset(groupId, tosUrl, kind === "video" ? "Video" : "Image");
    console.log("[upload-media] assetId:", assetId);
  } catch (err) {
    console.error("[upload-media] createAsset error:", err);
    const msg = err instanceof Error ? err.message : "asset registration failed";
    return Response.json({ error: msg }, { status: 500 });
  }

  // ── 5. Poll until Active ───────────────────────────────────────────────────
  try {
    for (let i = 0; i < POLL_MAX; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const info = await getAsset(assetId);
      if (info.status === "Active") break;
      if (info.status === "Failed") {
        return Response.json({ error: `BytePlus asset failed: ${info.errorMessage ?? "unknown"}` }, { status: 500 });
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "polling failed";
    return Response.json({ error: msg }, { status: 500 });
  }

  return Response.json({ assetId, tosUrl, groupId, kind }, { status: 201 });
}
