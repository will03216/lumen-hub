"use client";

/**
 * The upstream request, as a cURL command.
 *
 * The compiled-prompt disclosure answers "what text went up?". This answers
 * the rest of the question — which model id after alias resolution, which
 * endpoint, which defaults, and how each reference travelled. In a demo that
 * is the difference between "the model got it wrong" and "we sent it the
 * wrong thing", and you cannot tell those apart from the output alone.
 *
 * Rendered by the server (app/api/edit/curl) rather than assembled here: the
 * alias map, the base URL and the body defaults are server-side, and a
 * plausible-looking client-side guess at them would be worse than no feature
 * at all.
 *
 * The key is never in it — the command carries `$BYTEPLUS_API_KEY` — so this
 * is safe to paste into a ticket or hand to a customer.
 */

import * as React from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { buildEditRequest } from "@/lib/edit/use-edit-render";
import type { WireImageDescriptor } from "@/lib/edit/curl";
import type { EditSession } from "@/lib/edit/types";

export function RequestCurl({ session }: { session: EditSession }) {
  const req = React.useMemo(() => buildEditRequest(session), [session]);
  const [curl, setCurl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  // Descriptors, not bytes. An inlined reference is several MB of base64;
  // sending it here to have it printed back would be absurd, and printing it
  // would produce something unreadable. See lib/edit/curl.ts.
  const images = React.useMemo<WireImageDescriptor[]>(
    () =>
      req.orderedRefs.map((ref) => {
        const plan = req.plans.find((p) => p.refId === ref.id);
        const annotated = plan?.transport === "composite";
        const remote = /^https?:/i.test(ref.url);
        if (remote && !annotated) return { kind: "url", url: ref.url };
        return {
          kind: "inlined",
          from: ref.url,
          mime: mimeFor(ref.url),
          annotated,
        };
      }),
    [req],
  );

  // Keyed on the request itself, so editing the instruction or swapping the
  // model refreshes it rather than leaving a stale command on screen — the
  // one failure mode that would make this actively misleading.
  const signature = JSON.stringify({
    prompt: req.prompt,
    model: req.model,
    size: req.size,
    seed: req.seed,
    images,
  });

  React.useEffect(() => {
    let cancelled = false;
    setError(null);
    const run = async () => {
      try {
        const res = await fetch("/api/edit/curl", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: signature,
        });
        const data = (await res.json().catch(() => ({}))) as {
          curl?: string;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !data.curl) {
          setError(data.error ?? `Could not build the request (${res.status}).`);
          return;
        }
        setCurl(data.curl);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [signature]);

  async function copy() {
    if (!curl) return;
    try {
      await navigator.clipboard.writeText(curl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not reach the clipboard — select the text and copy it.");
    }
  }

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-mute">
          Upstream request
        </span>
        <button
          onClick={() => void copy()}
          disabled={!curl}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:border-border-strong hover:text-ink disabled:opacity-40"
        >
          {copied ? (
            <Check className="size-3" />
          ) : (
            <Copy className="size-3" />
          )}
          {copied ? "Copied" : "Copy cURL"}
        </button>
        <span className="text-[10px] text-ink-mute">
          key excluded — run after{" "}
          <code className="font-mono">export BYTEPLUS_API_KEY=…</code>
        </span>
      </div>

      {error ? (
        <p className="text-[11px] leading-relaxed text-[oklch(0.72_0.22_15)]">
          {error}
        </p>
      ) : curl ? (
        <pre className="max-h-[260px] overflow-auto whitespace-pre rounded-[10px] border border-border bg-[var(--bg)] p-3 font-mono text-[11px] leading-relaxed text-ink-dim">
          {curl}
        </pre>
      ) : (
        <div className="flex items-center gap-2 px-1 py-2 text-[11px] text-ink-mute">
          <Loader2 className="size-3 animate-spin" />
          Building…
        </div>
      )}
    </div>
  );
}

/**
 * What the inlined copy will be encoded as.
 *
 * Mirrors `encodingFor` in use-edit-render: only formats that definitionally
 * cannot carry alpha become JPEG, because canvas readback is RGBA and
 * toDataURL("image/jpeg") composites transparency onto black.
 */
function mimeFor(url: string): string {
  const path = (url.split("?")[0] ?? "").toLowerCase();
  const jpeg =
    url.startsWith("data:image/jpeg") ||
    url.startsWith("data:image/jpg") ||
    path.endsWith(".jpg") ||
    path.endsWith(".jpeg");
  return jpeg ? "image/jpeg" : "image/png";
}
