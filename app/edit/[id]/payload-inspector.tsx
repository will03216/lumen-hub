"use client";

/**
 * The images that actually go up — the bytes, not a description of them.
 *
 * "Is it sending the edited image or the clean one?" cannot be answered from
 * the cURL block, because the base64 there is elided. It also cannot be
 * answered from the canvas, which shows marks that may or may not travel as
 * pixels. So this resolves the payload through the SAME function the render
 * uses (`resolveWirePayloads`) and puts each resulting image on screen at the
 * size it will be sent, with its byte count.
 *
 * ── What you should expect to see, and why ───────────────────────────────
 *
 * · A reference carrying only POINT or BOX marks appears CLEAN. That is
 *   correct and deliberate: those compile to `<point>` / `<bbox>` coordinate
 *   tags in the prompt and the contract sends the image untouched. Drawing
 *   them into the pixels as well would show the model markup it is already
 *   being told about numerically, and it would have to decide whether the
 *   green box is part of the photograph.
 *
 * · A reference carrying a BRUSH or ARROW appears with magenta markup burned
 *   in, because those have no tag equivalent anywhere in the contract. The
 *   prompt then ends with "do not reproduce the magenta markup in the output".
 *
 * So "the edited image" is sent only when the edit cannot be expressed any
 * other way. Seeing a clean image next to a box mark is the system working.
 *
 * Resolving costs real work — it rasterises and base64s every reference — so
 * it runs on demand rather than every time the disclosure opens.
 */

import * as React from "react";
import { Download, ExternalLink, Loader2 } from "lucide-react";
import { formatBytes } from "@/lib/edit/curl";
import {
  buildEditRequest,
  resolveWirePayloads,
  type WirePayload,
} from "@/lib/edit/use-edit-render";
import type { EditSession } from "@/lib/edit/types";

export function PayloadInspector({ session }: { session: EditSession }) {
  const [payloads, setPayloads] = React.useState<WirePayload[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function resolve() {
    setBusy(true);
    setError(null);
    try {
      setPayloads(await resolveWirePayloads(buildEditRequest(session)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-mute">
          Payload images
        </span>
        <button
          onClick={() => void resolve()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:border-border-strong hover:text-ink disabled:opacity-40"
        >
          {busy && <Loader2 className="size-3 animate-spin" />}
          {payloads ? "Re-resolve" : "Resolve what's sent"}
        </button>
        <span className="text-[10px] text-ink-mute">
          builds the real payload — point/box send a clean image, brush/arrow
          send a marked copy
        </span>
      </div>

      {error && (
        <p className="text-[11px] leading-relaxed text-[oklch(0.72_0.22_15)]">
          {error}
        </p>
      )}

      {payloads?.length === 0 && (
        <p className="text-[11px] text-ink-mute">
          No references — this would go up as a text-to-image request.
        </p>
      )}

      {payloads && payloads.length > 0 && (
        <div className="space-y-2">
          {payloads.map((p) => (
            <PayloadRow key={p.refId} payload={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function PayloadRow({ payload: p }: { payload: WirePayload }) {
  const inline = p.value.startsWith("data:");
  const [hash, setHash] = React.useState<string | null>(null);

  // SHA-256 of the exact bytes, so "is this the same image as the source?"
  // can be settled by comparison rather than by looking hard at two
  // thumbnails. Note that a CLEAN payload will still not match the file on
  // disk: everything inlined is re-encoded through a canvas, and may be
  // downscaled to the model's pixel ceiling. Identical PIXELS, different
  // bytes. The hash is for comparing payloads with each other and with a
  // file you downloaded from here — not with the original upload.
  React.useEffect(() => {
    if (!inline) return;
    let cancelled = false;
    void (async () => {
      try {
        const bytes = decodeDataUri(p.value);
        if (!bytes || !globalThis.crypto?.subtle) return;
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        if (cancelled) return;
        setHash(
          Array.from(new Uint8Array(digest))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(""),
        );
      } catch {
        // A hash is a nicety; its absence must not break the inspector.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [p.value, inline]);

  function download() {
    const bytes = decodeDataUri(p.value);
    if (!bytes) {
      // A remote reference: we never hold those bytes, so hand over the URL
      // rather than fabricating a download.
      window.open(p.value, "_blank", "noreferrer");
      return;
    }
    const mime = p.value.slice(5, p.value.indexOf(";"));
    const ext = mime.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `payload-${p.index}-${p.transport}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // One tick, or some browsers cancel the save.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="flex items-start gap-3 rounded-[10px] border border-border p-2">
      {/* The image element's src IS the payload string. What you are looking
          at is byte-for-byte what BytePlus receives — not a re-render of it. */}
      <a
        href={p.value}
        target="_blank"
        rel="noreferrer"
        className="size-16 shrink-0 overflow-hidden rounded-[6px] border border-border bg-[var(--bg)]"
        title="Open the exact payload at full size"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- this is a
            data URI or a remote CDN URL; the optimizer handles neither. */}
        <img src={p.value} alt="" className="size-full object-contain" />
      </a>

      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">
          image[{p.index - 1}] · {p.role}
          {p.label ? ` · ${p.label}` : ""}
        </div>
        <div className="text-[12px] leading-snug text-ink">
          {p.transport === "composite" ? (
            <>
              <span className="text-[oklch(0.72_0.28_330)]">Marked copy</span> —
              brush/arrow markup burned into these pixels.
            </>
          ) : (
            <>
              <span className="text-[var(--accent)]">Clean image</span> — any
              point/box marks travel as coordinates in the prompt, not pixels.
            </>
          )}
        </div>
        <div className="font-mono text-[10px] text-ink-mute">
          {inline
            ? `inlined · ${p.bytes !== undefined ? formatBytes(p.bytes) : "unknown size"}`
            : "sent as a URL — BytePlus fetches it directly"}
          {hash && ` · sha256 ${hash.slice(0, 16)}…`}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <RowAction onClick={download}>
            <Download className="size-3" />
            {inline ? "Download payload" : "Open URL"}
          </RowAction>
          {/* The source, for an A/B. Comparing the two by eye is the whole
              point — markup present or absent is not subtle. */}
          <a
            href={sourceOf(p)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:border-border-strong hover:text-ink"
          >
            <ExternalLink className="size-3" />
            Open source
          </a>
        </div>
      </div>
    </div>
  );
}

function RowAction({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:border-border-strong hover:text-ink"
    >
      {children}
    </button>
  );
}

/** Where the payload came from, for the side-by-side. */
function sourceOf(p: WirePayload): string {
  return p.sourceUrl;
}

/**
 * `data:…;base64,…` → the real bytes.
 *
 * Returns null for anything that is not a base64 data URI — a remote URL has
 * no bytes here to decode, and saying so is better than producing an empty
 * file that looks like a corrupt download.
 */
function decodeDataUri(value: string): Uint8Array<ArrayBuffer> | null {
  if (!value.startsWith("data:")) return null;
  const comma = value.indexOf(",");
  if (comma < 0 || !/;base64/i.test(value.slice(0, comma))) return null;
  const binary = atob(value.slice(comma + 1));
  // Explicitly over an ArrayBuffer, not the ArrayBufferLike default: crypto
  // .subtle and Blob both refuse a view that might sit on a SharedArrayBuffer.
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}
