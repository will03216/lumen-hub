/**
 * GET /api/model3d/mesh?u=<seed3d file_url>
 *
 * Seed3D returns the mesh as a .zip on a 24h-expiring TOS presigned URL,
 * containing a single `.glb`. The browser can't unzip-and-render that
 * cross-origin blob cleanly, so this route pulls the zip server-side
 * (while the signature is valid), extracts the .glb, and streams it back
 * SAME-ORIGIN with `model/gltf-binary`. The Studio turntable renderer then
 * loads it with three.js/GLTFLoader without a CORS or unzip step.
 *
 * Security: same allowlist as /api/media — we only fetch BytePlus /
 * Volcengine hosts, so this can't be used as an open unzip/SSRF proxy.
 */

import type { NextRequest } from "next/server";
import { unzipSync } from "fflate";
import { isByteplusHost } from "@/lib/media/byteplus-hosts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Seed3D meshes run ~45MB uncompressed; cap so a bad URL can't blow up heap.
const MAX_ZIP_BYTES = 200 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const cors = { "access-control-allow-origin": "*" };
  const target = req.nextUrl.searchParams.get("u");
  if (!target) return new Response("missing u", { status: 400, headers: cors });

  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return new Response("invalid url", { status: 400, headers: cors });
  }
  if (url.protocol !== "https:") {
    return new Response("https required", { status: 400, headers: cors });
  }
  if (!isByteplusHost(url.hostname)) {
    return new Response("host not allowed", { status: 403, headers: cors });
  }

  let upstream: Response;
  try {
    upstream = await fetch(url.toString(), { cache: "no-store" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch failed";
    return new Response(`upstream unreachable: ${message}`, {
      status: 502,
      headers: cors,
    });
  }
  if (!upstream.ok) {
    // 403 here usually means the presigned URL expired (>24h old).
    return new Response(`upstream ${upstream.status}`, {
      status: upstream.status === 404 ? 404 : 502,
      headers: cors,
    });
  }

  const zipBytes = new Uint8Array(await upstream.arrayBuffer());
  if (zipBytes.byteLength > MAX_ZIP_BYTES) {
    return new Response("mesh archive too large", { status: 413, headers: cors });
  }

  let glb: Uint8Array | undefined;
  try {
    const entries = unzipSync(zipBytes, {
      // Only inflate the mesh entry; skip anything else in the archive.
      filter: (f) => /\.glb$/i.test(f.name),
    });
    const name = Object.keys(entries).find((n) => /\.glb$/i.test(n));
    if (name) glb = entries[name];
  } catch (err) {
    const message = err instanceof Error ? err.message : "unzip failed";
    return new Response(`unzip failed: ${message}`, { status: 502, headers: cors });
  }
  if (!glb) {
    return new Response("no .glb in archive", { status: 502, headers: cors });
  }

  return new Response(new Uint8Array(glb), {
    status: 200,
    headers: {
      ...cors,
      "content-type": "model/gltf-binary",
      "content-length": String(glb.byteLength),
      // Immutable per task; safe to cache briefly on the client.
      "cache-control": "private, max-age=300",
    },
  });
}
