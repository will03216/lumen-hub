"use client";

/**
 * AudioGenerator — sidebar-only TTS controls for the §03 Audio tab (§63).
 *
 * TTS is synchronous: one POST /api/audio returns the audio bytes
 * inline, no in-flight polling. After the Freepik-style rework the
 * right side moved to the shared `<CreationsFeed>` — this file keeps
 * just the script textarea, voice / model dropdowns, emotion + dial
 * controls, and the Generate button.
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AUDIO_EMOTIONS,
  AUDIO_MODELS,
  AUDIO_VOICES,
  DEFAULT_AUDIO_MODEL_ID,
  DEFAULT_AUDIO_VOICE_ID,
  MAX_AUDIO_TEXT_LEN,
  type AudioEmotion,
} from "@/lib/studio/models";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/ui/panel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { stageGeneratedAudio } from "@/lib/library/auto-save";

const SUGGESTIONS = [
  "Welcome to the show. Tonight, three stories about light, motion, and the quiet decisions that shape them.",
  "In the morning the city is at its softest. The trams move like reluctant cats.",
  "When you cannot find the path forward, sometimes it helps to listen for the path beneath your feet.",
] as const;

export function AudioGenerator() {
  const [text, setText] = useState("");
  const [voiceId, setVoiceId] = useState<string>(DEFAULT_AUDIO_VOICE_ID);
  const [model, setModel] = useState<string>(DEFAULT_AUDIO_MODEL_ID);
  const [emotion, setEmotion] = useState<AudioEmotion>("neutral");
  // Minimax dial conventions: speed 0.5-2.0, volume 0-10, pitch -12..12.
  // Default values match the upstream defaults so unmoved dials don't
  // shape the output.
  const [speed, setSpeed] = useState<number>(1.0);
  const [volume, setVolume] = useState<number>(5);
  const [pitch, setPitch] = useState<number>(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textLen = text.length;
  const overlimit = textLen > MAX_AUDIO_TEXT_LEN;

  const selectedVoice =
    AUDIO_VOICES.find((v) => v.id === voiceId) ?? AUDIO_VOICES[0];

  async function onGenerate() {
    if (!text.trim() || overlimit) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          voice_id: voiceId,
          model,
          speed,
          volume,
          pitch,
          emotion,
        }),
      });
      const data = (await res.json()) as {
        data?: Array<{ url: string; durationSec?: number }>;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      const first = data.data?.[0];
      if (!first?.url) throw new Error("No audio URL in response");
      // Stage as draft — user picks which graduate into Library via
      // the Save chip. Same §60 contract as image/video.
      stageGeneratedAudio({
        url: first.url,
        text,
        voiceId,
        model,
        durationSec: first.durationSec ?? 0,
        speed,
        volume,
        pitch,
        emotion,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel index="01" title="Script">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (!loading && text.trim() && !overlimit) {
                  void onGenerate();
                }
              }
            }}
            placeholder="Write the line. Punctuation guides the cadence; periods and commas land harder than line breaks."
            rows={7}
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s, i) => (
                <Chip key={i} onClick={() => setText(s)}>
                  sample #{i + 1}
                </Chip>
              ))}
            </div>
            <span
              className={cn(
                "font-mono text-[10px] tracking-[0.10em]",
                overlimit ? "text-[oklch(0.78_0.18_25)]" : "text-ink-dim",
              )}
            >
              {textLen}/{MAX_AUDIO_TEXT_LEN}
            </span>
          </div>
        </Panel>

        <Panel index="02" title="Voice">
          <VoiceList value={voiceId} onChange={setVoiceId} />
        </Panel>

        <Panel index="03" title="Engine">
          <ModelList value={model} onChange={setModel} />
        </Panel>

        <Panel index="04" title="Tone">
          <Label className="mb-2 block">Emotion</Label>
          <Select
            value={emotion}
            onValueChange={(v) => setEmotion(v as AudioEmotion)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUDIO_EMOTIONS.map((e) => (
                <SelectItem key={e} value={e}>
                  {e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Dial
              label="Speed"
              value={speed}
              min={0.5}
              max={2}
              step={0.1}
              onChange={setSpeed}
            />
            <Dial
              label="Volume"
              value={volume}
              min={0}
              max={10}
              step={1}
              onChange={setVolume}
            />
            <Dial
              label="Pitch"
              value={pitch}
              min={-12}
              max={12}
              step={1}
              onChange={setPitch}
            />
          </div>
          <p className="mt-2 font-mono text-[10px] leading-relaxed tracking-[0.08em] text-ink-dim">
            Speed 1.0 = natural cadence. Pitch in semitones; ±12 = one
            octave. Volume is a soft gain (1–10).
          </p>
        </Panel>

        <Button
          onClick={onGenerate}
          disabled={loading || !text.trim() || overlimit}
          variant="primary"
          size="lg"
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Rendering…
            </>
          ) : (
            <>
              Render voice{" "}
              <span className="font-serif italic text-[15px] leading-none">
                ↵
              </span>
            </>
          )}
        </Button>

        {error && (
          <div className="rounded-[10px] border border-[oklch(0.7_0.2_25)]/30 bg-[oklch(0.7_0.2_25)]/5 p-3 font-mono text-[11px] uppercase tracking-[0.10em] text-[oklch(0.78_0.18_25)]">
            {error}
          </div>
        )}

        <p className="font-mono text-[10px] leading-relaxed tracking-[0.08em] text-ink-dim">
          VOICE:{" "}
          <span className="text-ink normal-case tracking-normal">
            {selectedVoice.label}
          </span>
          . Rendered server-side via Minimax t2a_v2. Files cached locally
          — no signed-URL expiry.
        </p>
    </div>
  );
}

function VoiceList({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-2">
      {AUDIO_VOICES.map((v) => {
        const active = value === v.id;
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onChange(v.id)}
            aria-pressed={active}
            className={cn(
              "grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[12px] border p-3 text-left transition-all cursor-pointer hover:-translate-y-px",
              active
                ? "border-accent bg-accent-soft"
                : "border-border bg-panel hover:border-[var(--line-strong)]",
            )}
          >
            <span
              className={cn(
                "size-2 rounded-full",
                active ? "bg-accent" : "bg-[var(--line-strong)]",
              )}
            />
            <span className="block">
              <span className="block text-[13px] font-medium text-ink">
                {v.label}
              </span>
              <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.10em] text-ink-dim">
                {v.hint}
              </span>
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">
              {active ? "ACTIVE" : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ModelList({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-2">
      {AUDIO_MODELS.map((m) => {
        const active = value === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id)}
            aria-pressed={active}
            className={cn(
              "grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[12px] border p-3 text-left transition-all cursor-pointer hover:-translate-y-px",
              active
                ? "border-accent bg-accent-soft"
                : "border-border bg-panel hover:border-[var(--line-strong)]",
            )}
          >
            <span
              className={cn(
                "size-2 rounded-full",
                active ? "bg-accent" : "bg-[var(--line-strong)]",
              )}
            />
            <span className="block">
              <span className="block text-[13px] font-medium text-ink">
                {m.label}
              </span>
              <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.10em] text-ink-dim">
                {m.hint}
              </span>
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">
              {active ? "ACTIVE" : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Dial({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <Label className="mb-2 block">{label}</Label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
        className="h-10 w-full rounded-[10px] border border-border bg-panel px-3 text-[13px] text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
      />
    </div>
  );
}
