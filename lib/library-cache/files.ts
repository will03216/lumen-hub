import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

export const LIBRARY_CACHE_DIR = path.join(
  process.cwd(),
  "public",
  "library-cache",
);

const CACHEABLE_EXTENSIONS = new Map<string, string>([
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
  [".mov", "video/quicktime"],
  [".mp3", "audio/mpeg"],
  [".wav", "audio/wav"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
]);

type ResponseMethod = "GET" | "HEAD";

type ByteRange = {
  start: number;
  end: number;
};

export function resolveLibraryCachePath(filename: string): string | null {
  if (!filename) return null;
  if (path.basename(filename) !== filename) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(filename)) return null;
  return path.join(LIBRARY_CACHE_DIR, filename);
}

export async function createLibraryCacheResponse({
  filename,
  method,
  rangeHeader,
}: {
  filename: string;
  method: ResponseMethod;
  rangeHeader?: string | null;
}): Promise<Response> {
  const filePath = resolveLibraryCachePath(filename);
  if (!filePath) {
    return new Response("invalid filename", { status: 400 });
  }

  let info;
  try {
    info = await stat(filePath);
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? err.code : undefined;
    return new Response(code === "ENOENT" ? "not found" : "stat failed", {
      status: code === "ENOENT" ? 404 : 500,
    });
  }

  const headers = baseHeaders(filename, info.size, info.mtime);
  const range = parseRange(rangeHeader, info.size);
  if (rangeHeader && !range) {
    headers.set("content-range", `bytes */${info.size}`);
    return new Response("invalid range", { status: 416, headers });
  }

  if (!range) {
    return new Response(
      method === "HEAD"
        ? null
        : (Readable.toWeb(createReadStream(filePath)) as ReadableStream),
      {
        status: 200,
        headers,
      },
    );
  }

  headers.set("content-length", String(range.end - range.start + 1));
  headers.set("content-range", `bytes ${range.start}-${range.end}/${info.size}`);
  return new Response(
    method === "HEAD"
      ? null
      : (Readable.toWeb(
          createReadStream(filePath, { start: range.start, end: range.end }),
        ) as ReadableStream),
    {
      status: 206,
      headers,
    },
  );
}

function baseHeaders(filename: string, size: number, mtime: Date): Headers {
  const headers = new Headers();
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("content-length", String(size));
  headers.set(
    "content-type",
    CACHEABLE_EXTENSIONS.get(path.extname(filename).toLowerCase()) ??
      "application/octet-stream",
  );
  headers.set(
    "content-disposition",
    `inline; filename="${filename.replace(/"/g, "")}"`,
  );
  headers.set("last-modified", mtime.toUTCString());
  return headers;
}

function parseRange(header: string | null | undefined, size: number): ByteRange | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, startRaw, endRaw] = match;
  if (!startRaw && !endRaw) return null;

  let start: number;
  let end: number;

  if (!startRaw) {
    const suffixLength = Number(endRaw);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number(startRaw);
    if (!Number.isInteger(start) || start < 0 || start >= size) return null;
    end = endRaw ? Number(endRaw) : size - 1;
    if (!Number.isInteger(end) || end < start) return null;
    end = Math.min(end, size - 1);
  }

  return { start, end };
}
