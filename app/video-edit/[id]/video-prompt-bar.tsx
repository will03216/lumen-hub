"use client";

/**
 * The submit bar: intent, variant, render settings, and the disclosure.
 *
 * ── Why the disclosure is not optional ──────────────────────────────────
 *
 * When a render surprises someone in a demo, the first question is "what did
 * it actually send?" — and a reconstruction answers a different question than
 * the real thing. So this shows the compiled prompt verbatim and the exact
 * request body, both taken from the same compile call the submit path uses.
 * They cannot disagree, because there is only one of them.
 *
 * The button is disabled by compiler ERRORS, never by warnings. Every error is
 * a request that would be rejected upstream or silently wrong; every warning
 * is something the user may legitimately want to do anyway.
 */

import * as React from "react";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { findVideoModel } from "@/lib/studio/models";
import { buildVideoRequest } from "@/lib/video-edit/use-video-edit-render";
import { audioModeIsValid } from "@/lib/video-edit/video-prompt";
import type { CompiledVideoPrompt } from "@/lib/video-edit/video-prompt";
import { PROMPT_VARIANTS, type AudioMode, type VideoEditSession } from "@/lib/video-edit/types";
import { variantAvailability } from "@/lib/video-edit/variant-select";
import { cn } from "@/lib/utils";

export function VideoPromptBar({
  session,
  compiled,
  autoVariantWhy,
  busy,
  onPatch,
  onRender,
  onCancel,
}: {
  session: VideoEditSession;
  compiled: CompiledVideoPrompt;
  autoVariantWhy: string;
  busy: boolean;
  onPatch: (patch: Partial<VideoEditSession>) => void;
  onRender: () => void;
  onCancel: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const availability = React.useMemo(
    () => variantAvailability(session),
    [session],
  );
  const caps = findVideoModel(session.model)?.caps;

  const windowLength = session.window.end - session.window.start;
  const audio = audioModeIsValid(
    session.audioMode,
    windowLength,
    compiled.duration,
  );

  const blocked = compiled.errors.length > 0;

  return (
    <div className="space-y-2.5 border-t border-border px-4 py-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[240px] flex-1">
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-ink-mute">
            What should change in the clip
          </span>
          <textarea
            rows={2}
            value={session.intent}
            onChange={(e) => onPatch({ intent: e.target.value })}
            placeholder="she walks toward camera and the leather creases at the elbow…"
            className="w-full resize-none rounded-[8px] border border-border bg-transparent px-3 py-2 text-[13px] leading-relaxed text-ink outline-none placeholder:text-ink-mute focus:border-ink-dim"
          />
        </label>

        <Select
          label="Variant"
          value={session.variant ?? "auto"}
          onChange={(v) =>
            onPatch({ variant: v === "auto" ? null : (v as VideoEditSession["variant"]) })
          }
          options={[
            { value: "auto", label: `Auto (${compiled.variant})` },
            ...PROMPT_VARIANTS.map((v) => {
              const avail = availability.find((a) => a.id === v.id);
              return {
                value: v.id,
                label: `${v.id} · ${v.label}`,
                disabled: !avail?.available,
                title: avail?.reason ?? v.hint,
              };
            }),
          ]}
        />

        <Select
          label="Length"
          value={String(session.duration)}
          onChange={(v) => onPatch({ duration: Number(v) })}
          options={(caps?.durations ?? [4, 5, 6, 8, 10, 12, 15]).map((d) => ({
            value: String(d),
            label: `${d}s`,
          }))}
        />

        <Select
          label="Ratio"
          value={session.ratio}
          onChange={(v) => onPatch({ ratio: v })}
          options={["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"].map((r) => ({
            value: r,
            label: r,
          }))}
        />

        <Select
          label="Quality"
          value={session.resolution}
          onChange={(v) => onPatch({ resolution: v })}
          options={(caps?.resolutions ?? ["480p", "720p", "1080p"]).map((r) => ({
            value: r,
            label: r,
          }))}
        />

        <Select
          label="Audio"
          value={session.audioMode}
          onChange={(v) => onPatch({ audioMode: v as AudioMode })}
          options={[
            { value: "preserve", label: "Keep original" },
            { value: "generate", label: "Generate" },
            { value: "silent", label: "Silent" },
          ]}
        />

        {busy ? (
          <Button size="md" variant="default" onClick={onCancel}>
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            Cancel
          </Button>
        ) : (
          <Button
            size="md"
            variant="primary"
            disabled={blocked}
            onClick={onRender}
            title={blocked ? compiled.errors[0] : undefined}
          >
            <Sparkles className="mr-1.5 size-3.5" />
            Render video
          </Button>
        )}
      </div>

      {/* Errors block; warnings inform. Kept visually distinct because acting
          on them is a different decision. */}
      {compiled.errors.map((e) => (
        <p key={e} className="text-[12px] text-[oklch(0.72_0.22_15)]">
          {e}
        </p>
      ))}
      {compiled.warnings.map((w) => (
        <p key={w} className="text-[12px] text-[oklch(0.78_0.16_75)]">
          {w}
        </p>
      ))}
      {!audio.ok && (
        <p className="text-[12px] text-[oklch(0.78_0.16_75)]">{audio.reason}</p>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-mute transition-colors hover:text-ink-dim"
      >
        <ChevronDown
          className={cn("size-3 transition-transform", open && "rotate-180")}
        />
        Show compiled prompt
      </button>

      {open && (
        <div className="space-y-3 rounded-[10px] border border-border p-3">
          <Field label={`Variant ${compiled.variant}`}>
            {session.variant ? "Chosen manually." : autoVariantWhy}
          </Field>
          <Field label={`Duration ${compiled.duration}s`}>
            {compiled.durationBasis}
          </Field>
          <Field label="Prompt">
            <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-ink-dim">
              {compiled.prompt}
            </pre>
          </Field>
          {compiled.tagMap.length > 0 && (
            <Field label="References">
              <ul className="space-y-0.5">
                {compiled.tagMap.map((t) => (
                  <li key={t.tag} className="font-mono text-[11px] text-ink-dim">
                    {t.tag} — {t.description}
                  </li>
                ))}
              </ul>
            </Field>
          )}
          {/* The REAL body, from the same builder the submit path uses — not
              a description of it. "What did it actually send?" is the first
              question when a render surprises someone, and a reconstruction
              answers a different question. */}
          <Field label="Request body">
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-ink-mute">
              {JSON.stringify(buildVideoRequest(session, compiled), null, 2)}
            </pre>
          </Field>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-ink-mute">
        {label}
      </span>
      <div className="text-[12px] leading-relaxed text-ink-dim">{children}</div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string; disabled?: boolean; title?: string }>;
}) {
  return (
    <label className="shrink-0">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-ink-mute">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-[8px] border border-border bg-transparent px-2 py-2 text-[12px] text-ink outline-none focus:border-ink-dim"
      >
        {options.map((o) => (
          <option
            key={o.value}
            value={o.value}
            disabled={o.disabled}
            title={o.title}
          >
            {o.label}
            {o.disabled ? " — unavailable" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
