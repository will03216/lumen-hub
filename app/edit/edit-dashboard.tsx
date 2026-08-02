"use client";

/**
 * /edit — session list plus the three ways to start one.
 *
 * Follows app/story/stories-shell.tsx for structure and chrome. The one
 * substantive difference: a story starts empty, but an edit is meaningless
 * without an image, so creation is asynchronous (upload → measure → create)
 * and needs busy and error states the story shell doesn't.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Globe, Image as ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  deleteEditSession,
  getEditSessionsServerSnapshot,
  getEditSessionsSnapshot,
  subscribeEditSessions,
} from "@/lib/edit/sessions";
import type { EditSessionMeta } from "@/lib/edit/types";
import {
  startEditSessionFromFile,
  startEditSessionFromUrl,
} from "@/lib/edit/start-session";
import { cn } from "@/lib/utils";

export function EditDashboard() {
  const router = useRouter();
  const sessions = React.useSyncExternalStore(
    subscribeEditSessions,
    getEditSessionsSnapshot,
    getEditSessionsServerSnapshot,
  );

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
        router.push(`/edit/${session.id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  const onFiles = React.useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      void start(() => startEditSessionFromFile(file));
    },
    [start],
  );

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (busy) return;
    onFiles(e.dataTransfer.files);
  }

  function submitUrl(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || busy) return;
    void start(() => startEditSessionFromUrl({ url: trimmed }));
  }

  return (
    <div>
      {/* Hero */}
      <div className="border-b border-border">
        <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 items-end gap-5 px-7 pb-6 pt-8 md:grid-cols-[1fr_auto] md:gap-6 md:pt-10">
          <div>
            <span className="plate inline-flex">§ EDIT · CANVAS</span>
            <h1
              className="font-serif mt-3 text-ink"
              style={{
                fontSize: "clamp(40px, 6vw, 80px)",
                letterSpacing: "-0.02em",
                lineHeight: 0.95,
              }}
            >
              Draw it, say it, <span className="italic">done.</span>
            </h1>
          </div>
          <div className="flex items-end justify-end gap-2">
            <Button
              variant="primary"
              size="md"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? "Preparing…" : "New Edit →"}
            </Button>
          </div>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          onFiles(e.target.files);
          // Reset so picking the same file twice in a row still fires.
          e.target.value = "";
        }}
      />

      {/* Body */}
      <div className="mx-auto w-full max-w-[1440px] px-7 pb-16 pt-10">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
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
              <ImageIcon className="size-5 text-ink-mute" />
            )}
            <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-mute">
              {busy ? "Preparing image…" : "Drop an image to start editing"}
            </div>
            <p className="max-w-[420px] text-[14px] leading-relaxed text-ink-dim">
              PNG, JPEG or WebP, up to 50 MB. Mark the region you want changed,
              describe the change, and Seedream 5.0 Pro leaves everything else
              alone.
            </p>

            {urlMode ? (
              <form onSubmit={submitUrl} className="flex w-full max-w-[460px] gap-2">
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
              <p className="max-w-[420px] text-[13px] text-[oklch(0.72_0.22_15)]">
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

function SessionCard({ session }: { session: EditSessionMeta }) {
  const [confirming, setConfirming] = React.useState(false);

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    if (!confirming) {
      setConfirming(true);
      // Two-step delete rather than a modal, matching the story cards.
      setTimeout(() => setConfirming(false), 3000);
      return;
    }
    deleteEditSession(session.id);
  }

  return (
    <Link
      href={`/edit/${session.id}`}
      className="group relative flex flex-col gap-3 overflow-hidden rounded-[14px] border border-border bg-panel transition-colors hover:border-border-strong"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--bg)]">
        {session.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote CDN
          // hosts are not in next.config's image allow-list, and a cover
          // thumbnail doesn't need the optimizer.
          <img
            src={session.coverUrl}
            alt=""
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <ImageIcon className="size-5 text-ink-mute" />
          </div>
        )}
      </div>

      <div className="flex items-start justify-between gap-2 px-4">
        <span className="font-serif line-clamp-2 text-[15px] italic leading-snug text-ink">
          {session.name}
        </span>
        <button
          onClick={handleDelete}
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
