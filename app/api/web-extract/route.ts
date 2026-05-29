import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGES = 8;
const MAX_VIDEOS = 4;
const MAX_TEXT_CHARS = 15_000;
const FETCH_TIMEOUT_MS = 10_000;

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get("url");
  const imgTarget = req.nextUrl.searchParams.get("img");

  // img-only mode: fetch a single image and return it as a base64 data URI
  if (!target && imgTarget) {
    const dataUri = await fetchImageAsDataUri(imgTarget);
    return Response.json({ imageDataUri: dataUri ?? null });
  }

  if (!target) {
    return Response.json({ error: "missing url" }, { status: 400 });
  }

  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return Response.json({ error: "invalid url" }, { status: 400 });
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return Response.json({ error: "http/https only" }, { status: 400 });
  }

  // Jina.ai reader — default path. Returns clean reader-mode markdown with ads,
  // embeds, and navigation stripped. Falls back to direct HTML fetch on failure.
  try {
    const jinaUrl = `https://r.jina.ai/${url.toString()}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    const res = await fetch(jinaUrl, {
      headers: {
          Accept: "application/json",
          "X-Return-Format": "markdown",
          "X-Target-Selector": "article, main, [role='main']",
          "X-Remove-Selector": "nav, footer, [class*='cookie'], [class*='consent'], [class*='subscribe'], [class*='comment'], [class*='related'], [class*='share']",
        },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      type JinaResponse = {
        data?: {
          title?: string;
          description?: string;
          content?: string;
          images?: Record<string, string>;
        };
      };
      const json = (await res.json()) as JinaResponse;
      const d = json.data ?? {};
      // Extract image URLs from Jina's images map first, then fall back to
      // parsing markdown ![...](url) syntax from the content.
      // Strip CDN size constraints (width=N, height=N, w=N, h=N) so we get
      // the full-resolution image rather than a thumbnail that fails BytePlus's
      // 300×300 minimum.
      const upgradeImageUrl = (raw: string): string => {
        try {
          const u = new URL(raw);
          ["width", "height", "w", "h"].forEach((p) => u.searchParams.delete(p));
          return u.toString();
        } catch {
          return raw;
        }
      };

      const imageSet = new Set<string>();
      for (const u of Object.values(d.images ?? {})) {
        if (typeof u === "string" && u.startsWith("http") && !u.endsWith(".svg"))
          imageSet.add(upgradeImageUrl(u));
      }
      if (imageSet.size === 0 && d.content) {
        const mdImgRe = /!\[[^\]]*\]\((https?:\/\/[^)]+)\)/g;
        let m: RegExpExecArray | null;
        while ((m = mdImgRe.exec(d.content)) !== null) {
          const u = m[1];
          if (!u.endsWith(".svg")) imageSet.add(upgradeImageUrl(u));
        }
      }
      const images = [...imageSet].slice(0, MAX_IMAGES);
      return Response.json({
        title: d.title ?? "",
        description: d.description ?? "",
        text: [d.title, d.description, d.content].filter(Boolean).join("\n\n").slice(0, MAX_TEXT_CHARS),
        images,
        videos: [],
      });
    }
    // Jina failed — fall through to direct fetch.
  } catch {
    // Network error on Jina — fall through to direct fetch.
  }

  // Direct fetch fallback — used when Jina.ai is unavailable.
  let html: string;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: ctrl.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!res.ok) {
      return Response.json({ error: `upstream returned ${res.status}` }, { status: 502 });
    }
    html = await res.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "fetch failed";
    return Response.json({ error: msg }, { status: 502 });
  }

  const result = extractPage(html, url.toString());
  return Response.json(result);
}

type ExtractResult = {
  title: string;
  description: string;
  text: string;
  images: string[];
  videos: string[];
};

// ── HTML cleaning ──────────────────────────────────────────────────────────

/** Remove structural noise that's never main content. */
function stripOuterChrome(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ");
}

/**
 * Try to isolate the primary article / main region of the page.
 * Order of preference: <main> → <article> → [role=main] → full stripped HTML.
 * Lazy regex is fine for these semantic tags; they aren't nested in real pages.
 */
function isolateMainContent(html: string): string {
  const mainMatch = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(html);
  if (mainMatch) return mainMatch[1];

  const articleMatch = /<article[^>]*>([\s\S]*?)<\/article>/i.exec(html);
  if (articleMatch) return articleMatch[1];

  // Some CMSes use role="main" on a <div> or <section>
  const roleMatch = /<(?:div|section)[^>]+role=["']main["'][^>]*>([\s\S]*?)<\/(?:div|section)>/i.exec(html);
  if (roleMatch) return roleMatch[1];

  return html;
}

// ── JSON-in-script extraction (CSR / SSG / hydration payloads) ────────────
//
// Many modern sites (Next.js, Nuxt, Remix) ship all their content inside a
// JSON blob in a <script> tag rather than rendered HTML. The browser runs JS
// to hydrate the page, but our server-side fetch only sees the empty shell.
// We harvest strings and URLs from those payloads as a fallback.

type JsonNode = string | number | boolean | null | JsonNode[] | { [k: string]: JsonNode };

/** Recursively collect all string leaf values from an arbitrary JSON tree. */
function collectStrings(node: JsonNode, out: string[] = []): string[] {
  if (typeof node === "string") {
    if (node.trim()) out.push(node);
  } else if (Array.isArray(node)) {
    for (const child of node) collectStrings(child, out);
  } else if (node && typeof node === "object") {
    for (const v of Object.values(node)) collectStrings(v, out);
  }
  return out;
}

/** Collect all URL-like strings (http/https) from the JSON tree. */
function collectUrls(node: JsonNode, out: string[] = []): string[] {
  if (typeof node === "string") {
    if (node.startsWith("http://") || node.startsWith("https://")) out.push(node);
  } else if (Array.isArray(node)) {
    for (const child of node) collectUrls(child, out);
  } else if (node && typeof node === "object") {
    for (const v of Object.values(node)) collectUrls(v, out);
  }
  return out;
}

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|svg)(\?|$)/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|$)/i;
const VIDEO_HOST = /youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com/i;

/**
 * Extract content from JSON hydration payloads embedded in <script> tags.
 * Handles:
 *   - <script id="__NEXT_DATA__"> (Next.js SSG/SSR)
 *   - <script type="application/ld+json"> (schema.org structured data)
 *   - window.__NUXT__ / window.__INITIAL_STATE__ patterns
 */
function extractFromScripts(html: string): {
  text: string;
  images: string[];
  videos: string[];
} {
  const allStrings: string[] = [];
  const allUrls: string[] = [];

  // 1. __NEXT_DATA__ — Next.js bakes pageProps into this tag
  const nextDataMatch = /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (nextDataMatch) {
    try {
      const json = JSON.parse(nextDataMatch[1]) as JsonNode;
      collectStrings(json, allStrings);
      collectUrls(json, allUrls);
    } catch { /* malformed — skip */ }
  }

  // 2. ld+json structured data (schema.org Recipe, Article, etc.)
  const ldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = ldRe.exec(html)) !== null) {
    try {
      const json = JSON.parse(m[1]) as JsonNode;
      collectStrings(json, allStrings);
      collectUrls(json, allUrls);
    } catch { /* skip */ }
  }

  // 3. window.__NUXT__ / window.__INITIAL_STATE__ / window.__PRELOADED_STATE__
  const windowStateRe = /window\.__(?:NUXT|INITIAL_STATE|PRELOADED_STATE)__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/i;
  const wsMatch = windowStateRe.exec(html);
  if (wsMatch) {
    try {
      const json = JSON.parse(wsMatch[1]) as JsonNode;
      collectStrings(json, allStrings);
      collectUrls(json, allUrls);
    } catch { /* skip */ }
  }

  // Classify collected URLs
  const images: string[] = [];
  const videos: string[] = [];
  const seenImg = new Set<string>();
  const seenVid = new Set<string>();

  for (const url of allUrls) {
    if (IMAGE_EXT.test(url) && !seenImg.has(url)) {
      seenImg.add(url);
      images.push(url);
    } else if ((VIDEO_EXT.test(url) || VIDEO_HOST.test(url)) && !seenVid.has(url)) {
      seenVid.add(url);
      videos.push(url);
    }
  }

  // Build a readable text summary from non-URL strings.
  // Rules (all must pass):
  //   - At least 3 chars and contains a letter
  //   - Not a URL
  //   - Not a hash/token (long run of alphanumeric+dash with no spaces)
  //   - Not an ISO timestamp
  //   - Not a MIME type or file extension string
  //   - Not JS code (contains function keywords or brace-heavy patterns)
  //   - Not a JSON fragment opener
  const textLines = allStrings.filter((s) => {
    if (s.length < 3) return false;
    if (!/[a-zA-Z]/.test(s)) return false;                  // must have a letter
    if (s.startsWith("http")) return false;
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return false;        // ISO timestamp
    if (/^[a-z]+\/[a-z]+$/i.test(s)) return false;          // MIME type e.g. image/webp
    if (/^\.[a-z]{2,5}$/.test(s)) return false;             // file extension e.g. .webp
    if (/^[a-z0-9_-]{20,}$/i.test(s)) return false;         // hash / opaque token
    if (/function\s*\(|=>\s*\{|\bvar\b|\bconst\b/.test(s)) return false; // JS code
    if (/^\s*[{[\]}]/.test(s)) return false;                 // JSON fragment
    if (s.startsWith("/")) return false;                     // URL path
    if (/\.(jpe?g|png|webp|gif|avif|mp4|webm|mov)$/i.test(s)) return false; // filename
    // URL slug: no spaces, only word chars + hyphens (e.g. "moong-dal-halwa")
    if (/^[a-z0-9][a-z0-9-]*[a-z0-9]$/i.test(s) && !s.includes(" ")) return false;
    return true;
  });

  // Deduplicate while preserving order
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const s of textLines) {
    if (!seen.has(s)) { seen.add(s); deduped.push(s); }
  }

  return {
    text: deduped.join("\n").slice(0, MAX_TEXT_CHARS),
    images: images.slice(0, MAX_IMAGES),
    videos: videos.slice(0, MAX_VIDEOS),
  };
}

// ── Full extraction ────────────────────────────────────────────────────────

function extractPage(html: string, base: string): ExtractResult {
  // Meta — read from full HTML before stripping (og tags often in <head>)
  const title = firstMatch(html, /<title[^>]*>([^<]{1,300})<\/title>/i) ?? "";

  const description =
    firstMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,500})["']/i) ??
    firstMatch(html, /<meta[^>]+content=["']([^"']{1,500})["'][^>]+name=["']description["']/i) ??
    firstMatch(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{1,500})["']/i) ??
    firstMatch(html, /<meta[^>]+content=["']([^"']{1,500})["'][^>]+property=["']og:description["']/i) ??
    "";

  const ogImage =
    firstMatch(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
    firstMatch(html, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);

  const ogVideo =
    firstMatch(html, /<meta[^>]+property=["']og:video["'][^>]+content=["']([^"']+)["']/i) ??
    firstMatch(html, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video["']/i);

  // Strip outer chrome, then isolate main content
  const stripped = stripOuterChrome(html);
  const content = isolateMainContent(stripped);

  // ── Images ───────────────────────────────────────────────────────────────
  const imgSrcs: string[] = [];
  const imgRe = /<img[^>]+src=["']([^"']+)["'][^>]*/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(content)) !== null) imgSrcs.push(m[1]);

  // Also check srcset for first candidate per img
  const srcsetRe = /<img[^>]+srcset=["']([^"']+)["'][^>]*/gi;
  while ((m = srcsetRe.exec(content)) !== null) {
    const first = m[1].split(",")[0].trim().split(/\s+/)[0];
    if (first) imgSrcs.push(first);
  }

  const images: string[] = [];
  const seen = new Set<string>();
  // og:image first — usually the editorial hero; then in-content images
  for (const src of ogImage ? [ogImage, ...imgSrcs] : imgSrcs) {
    if (src.startsWith("data:")) continue;
    const abs = toAbsolute(src, base);
    if (!abs || seen.has(abs)) continue;
    seen.add(abs);
    images.push(abs);
    if (images.length >= MAX_IMAGES) break;
  }

  // ── Videos ───────────────────────────────────────────────────────────────
  const videoSrcs: string[] = [];
  const videoTagRe = /<video[^>]+src=["']([^"']+)["'][^>]*/gi;
  while ((m = videoTagRe.exec(content)) !== null) videoSrcs.push(m[1]);
  const sourceRe = /<source[^>]+src=["']([^"']+)["'][^>]*type=["']video\/[^"']*["'][^>]*/gi;
  while ((m = sourceRe.exec(content)) !== null) videoSrcs.push(m[1]);
  const sourceRe2 = /<source[^>]+type=["']video\/[^"']*["'][^>]*src=["']([^"']+)["'][^>]*/gi;
  while ((m = sourceRe2.exec(content)) !== null) videoSrcs.push(m[1]);

  const videos: string[] = [];
  const seenV = new Set<string>();
  for (const src of ogVideo ? [ogVideo, ...videoSrcs] : videoSrcs) {
    if (src.startsWith("data:")) continue;
    const abs = toAbsolute(src, base);
    if (!abs || seenV.has(abs)) continue;
    seenV.add(abs);
    videos.push(abs);
    if (videos.length >= MAX_VIDEOS) break;
  }

  // ── Body text ─────────────────────────────────────────────────────────────
  const bodyText = content
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#?\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT_CHARS);

  // Surface title + description at the top so users immediately see what
  // the page is about; body text follows for additional context.
  let text = [title, description, bodyText].filter(Boolean).join("\n\n");

  // CSR / SSG fallback: if the HTML body yielded almost nothing (e.g. a
  // Next.js loading spinner), mine the JSON hydration payloads instead.
  // Threshold: fewer than 200 chars of body text means the page is likely
  // client-rendered and the real content lives in __NEXT_DATA__ or ld+json.
  if (bodyText.length < 200) {
    const fromScripts = extractFromScripts(html);
    if (fromScripts.text.length > bodyText.length) {
      text = [title, description, fromScripts.text].filter(Boolean).join("\n\n");
    }
    for (const url of fromScripts.images) {
      if (!seen.has(url) && images.length < MAX_IMAGES) {
        seen.add(url);
        images.push(url);
      }
    }
    for (const url of fromScripts.videos) {
      if (!seenV.has(url) && videos.length < MAX_VIDEOS) {
        seenV.add(url);
        videos.push(url);
      }
    }
  }

  return { title, description, text, images, videos };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function firstMatch(html: string, re: RegExp): string | undefined {
  return re.exec(html)?.[1]?.trim() || undefined;
}

function toAbsolute(src: string, base: string): string | undefined {
  try {
    return new URL(src, base).toString();
  } catch {
    return undefined;
  }
}

/** Fetch an image server-side and return it as a base64 data URI.
 *  Bypasses browser CORS and CDN hotlink checks. Returns undefined if the
 *  fetch fails or the file exceeds 8 MB (BytePlus image ceiling is 10 MB). */
async function fetchImageAsDataUri(src: string): Promise<string | undefined> {
  let imgUrl: URL;
  try {
    imgUrl = new URL(src);
  } catch {
    return undefined;
  }
  if (imgUrl.protocol !== "http:" && imgUrl.protocol !== "https:") return undefined;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(imgUrl.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "image/*,*/*;q=0.8",
      },
      signal: ctrl.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!res.ok) return undefined;
    const contentLength = Number(res.headers.get("content-length") ?? 0);
    if (contentLength > 8 * 1024 * 1024) return undefined;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 8 * 1024 * 1024) return undefined;
    const mime = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
    return `data:${mime};base64,${Buffer.from(buf).toString("base64")}`;
  } catch {
    return undefined;
  }
}
