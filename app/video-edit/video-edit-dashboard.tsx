"use client";

/**
 * /video-edit — session list plus the ways to start one.
 *
 * Mirrors app/edit/edit-dashboard.tsx. The one substantive difference is what
 * "preparing" means: an image needs measuring, a clip needs its metadata
 * decoded, which is slower and fails in more ways (no duration on a live
 * stream, an unsupported codec that still has a video/* MIME). Those land as
 * the error string rather than as a stuck spinner.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Film, Globe, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ALLOWED_VIDEO_MIME } from "@/lib/media/upload-formats";
import {
  deleteVideoEditSession,
  getVideoEditSessionsServerSnapshot,
  getVideoEditSessionsSnapshot,
  subscribeVideoEditSessions,
} from "@/lib/video-edit/sessions";
import {
  startVideoSessionFromFile,
  startVideoSessionFromUrl,
} from "@/lib/video-edit/start-video-session";
import type { VideoEditSessionMeta } from "@/lib/video-edit/types";
import { cn } from "@/lib/utils";

const VIDEO_ACCEPT = [...ALLOWED_VIDEO_MIME].join(",");

export function VideoEditDashboard() {
  const router = useRouter();
  const sessions = React.useSyncExternalStore(
    subscribeVideoEditSessions,
    getVideoEditSessionsSnapshot,
    getVideoEditSessionsServerSnapshot,
  );

  const searchParams = useSearchParams();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [urlMode, setUrlMode] = React.useState(false);
  const [url, setUrl] = React.useState("");
  const fileRef = React.useRef<HTMLInputElement>(null);

  const start = React.useCallback(
    async (run: () => Promise<{ id: string }>) => {
      setBusy(true);
      setError(null);
      try {
        const session = await run();
        router.push(`/video-edit/${session.id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  /**
   * `?src=` — a clip handed over from somewhere else (Studio's frame-extract
   * node today; anything else that has a URL tomorrow).
   *
   * Guarded by a ref rather than by the dependency array: StrictMode mounts
   * effects twice in development, and without the guard that is two sessions
   * created from one click, the second of which the user never asked for.
   */
  const seededRef = React.useRef(false);
  React.useEffect(() => {
    const src = searchParams.get("src");
    if (!src || seededRef.current) return;
    seededRef.current = true;
    void start(() => startVideoSessionFromUrl({ url: src }));
  }, [searchParams, start]);

  const onFiles = React.useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      void start(() => startVideoSessionFromFile(file));
    },
    [start],
  );

  return (
    <div>
      <div className="border-b border-border">
        <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 items-end gap-5 px-7 pb-6 pt-8 md:grid-cols-[1fr_auto] md:gap-6 md:pt-10">
          <div>
            <span className="plate inline-flex">§ VIDEO EDIT · SMART</span>
            <h1
              className="font-serif mt-3 text-ink"
              style={{
                fontSize: "clamp(40px, 6vw, 80px)",
                letterSpacing: "-0.02em",
                lineHeight: 0.95,
              }}
            >
              Pause it, draw on it, <span className="italic">it moves.</span>
            </h1>
          </div>
          <div className="flex items-end justify-end gap-2">
            <Button
              variant="primary"
              size="md"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? "Preparing…" : "New Video Edit →"}
            </Button>
          </div>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={VIDEO_ACCEPT}
        className="hidden"
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="mx-auto w-full max-w-[1440px] px-7 pb-16 pt-10">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (busy) return;
            onFiles(e.dataTransfer.files);
          }}
          className={cn(
            "rounded-[14px] border border-dashed p-8 transition-colors",
            dragging
              ? "border-ink bg-panel"
              : "border-border hover:border-border-strong",
          )}
        >
          <div className="flex flex-col items-center gap-4 text-center">
            {busy ? (
              <Loader2 className="size-5 animate-spin text-ink-dim" />
            ) : (
              <Film className="size-5 text-ink-mute" />
            )}
            <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-mute">
              {busy ? "Reading clip…" : "Drop a clip to start editing"}
            </div>
            <p className="max-w-[440px] text-[14px] leading-relaxed text-ink-dim">
              MP4, MOV or WebM, up to 50 MB and 120 seconds. Scrub to a moment,
              mark up that frame, and the change comes back in motion.
            </p>

            {urlMode ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const trimmed = url.trim();
                  if (!trimmed || busy) return;
                  void start(() => startVideoSessionFromUrl({ url: trimmed }));
                }}
                className="flex w-full max-w-[460px] gap-2"
              >
                <input
                  autoFocus
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setUrlMode(false);
                  }}
                  placeholder="https://…"
                  className="min-w-0 flex-1 rounded-full border border-border bg-transparent px-4 py-2 text-[13px] text-ink outline-none placeholder:text-ink-mute focus:border-ink-dim"
                />
                <Button type="submit" size="sm" variant="primary" disabled={busy}>
                  Open
                </Button>
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="default"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                >
                  Choose file
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setUrlMode(true)}
                >
                  <Globe className="mr-1.5 size-3.5" />
                  Paste a URL
                </Button>
              </div>
            )}

            {error && (
              <p className="max-w-[440px] text-[13px] text-[oklch(0.72_0.22_15)]">
                {error}
              </p>
            )}
          </div>
        </div>

        {sessions !== null && sessions.length > 0 && (
          <div className="mt-10 space-y-6">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dim">
              {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
            </span>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {sessions.map((s) => (
                <SessionCard key={s.id} session={s} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SessionCard({ session }: { session: VideoEditSessionMeta }) {
  const [confirming, setConfirming] = React.useState(false);

  return (
    <Link
      href={`/video-edit/${session.id}`}
      className="group relative flex flex-col gap-3 overflow-hidden rounded-[14px] border border-border bg-panel transition-colors hover:border-border-strong"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-[var(--bg)]">
        {session.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote CDN
          // hosts aren't in next.config's image allow-list, and a thumbnail
          // doesn't need the optimizer.
          <img
            src={session.coverUrl}
            alt=""
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <Film className="size-5 text-ink-mute" />
          </div>
        )}
      </div>

      <div className="flex items-start justify-between gap-2 px-4">
        <span className="font-serif line-clamp-2 text-[15px] italic leading-snug text-ink">
          {session.name}
        </span>
        <button
          onClick={(e) => {
            e.preventDefault();
            if (!confirming) {
              setConfirming(true);
              setTimeout(() => setConfirming(false), 3000);
              return;
            }
            deleteVideoEditSession(session.id);
          }}
          className="mt-0.5 shrink-0 rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-mute transition-colors hover:text-[oklch(0.72_0.22_15)]"
          title="Delete session"
        >
          {confirming ? "Sure?" : "✕"}
        </button>
      </div>

      <div className="px-4 pb-4 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute">
        {formatRelative(session.updatedAt)}
      </div>
    </Link>
  );
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
