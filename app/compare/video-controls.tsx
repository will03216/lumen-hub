"use client";

/**
 * VideoControls — the left-rail Panel pair (Mode + Parameters) used when
 * the active pair `kind` is "video".
 *
 * Pure presentational + dispatch — all state lives in the shell so the
 * URL serializer, ⌘↵ shortcut, and saved-pair picker can drive the same
 * inputs without prop-drilling React state across the boundary.
 *
 * Capability gates that the shell pre-computes and passes in:
 *   · resolutions / durations — intersection of both engines' supported
 *     values, so the user can never pick something one side rejects.
 *   · audioSupported — true only when BOTH sides support generate_audio,
 *     because asymmetric audio destroys the A/B fairness premise.
 *
 * SharedFrameSlot is private to this file — only i2v mode needs it, and
 * sharing the frame across both engines is the whole reason it exists
 * (the fairest i2v test is animating the same input frame with both).
 */

import { X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { ModeBtn } from "@/components/ui/mode-btn";
import { Panel } from "@/components/ui/panel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import {
  VIDEO_RATIOS,
  type VideoMode,
  type VideoRatio,
  type VideoResolution,
} from "@/lib/studio/models";
import { SeedField } from "./seed-field";

export function VideoControls({
  videoMode,
  onVideoModeChange,
  startFrame,
  onStartFrameChange,
  resolutions,
  durations,
  audioSupported,
  resolution,
  onResolutionChange,
  duration,
  onDurationChange,
  ratio,
  onRatioChange,
  seed,
  onSeedChange,
  onRandomizeSeed,
  cameraFixed,
  onCameraFixedChange,
  generateAudio,
  onGenerateAudioChange,
}: {
  videoMode: VideoMode;
  onVideoModeChange: (m: VideoMode) => void;
  startFrame: string | null;
  onStartFrameChange: (s: string | null) => void;
  resolutions: readonly VideoResolution[];
  durations: readonly number[];
  audioSupported: boolean;
  resolution: VideoResolution;
  onResolutionChange: (r: VideoResolution) => void;
  duration: number;
  onDurationChange: (d: number) => void;
  ratio: VideoRatio;
  onRatioChange: (r: VideoRatio) => void;
  seed: string;
  onSeedChange: (s: string) => void;
  onRandomizeSeed: () => void;
  cameraFixed: boolean;
  onCameraFixedChange: (v: boolean) => void;
  generateAudio: boolean;
  onGenerateAudioChange: (v: boolean) => void;
}) {
  return (
    <>
      <Panel index="02" title="Shared mode">
        <div className="grid grid-cols-2 gap-2">
          <ModeBtn
            active={videoMode === "t2v"}
            onClick={() => onVideoModeChange("t2v")}
            glyph="T"
            label="Text"
            sub="to video"
          />
          <ModeBtn
            active={videoMode === "i2v"}
            onClick={() => onVideoModeChange("i2v")}
            glyph="I"
            label="Image"
            sub="to video"
          />
        </div>
        {videoMode === "i2v" && (
          <div className="mt-3">
            <Label className="mb-2 block">Shared starting frame</Label>
            <SharedFrameSlot
              value={startFrame}
              onChange={onStartFrameChange}
            />
            <p className="mt-2 font-mono text-[10px] leading-relaxed tracking-[0.08em] text-ink-dim">
              Both engines animate the same frame — the fairest i2v test.
            </p>
          </div>
        )}
      </Panel>

      <Panel index="03" title="Shared parameters">
        <div className="grid grid-cols-3 gap-2.5">
          <div>
            <Label className="mb-2 block">Res</Label>
            <Select
              value={resolution}
              onValueChange={(v) => onResolutionChange(v as VideoResolution)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {resolutions.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-2 block">Duration</Label>
            <Select
              value={String(duration)}
              onValueChange={(v) => onDurationChange(Number(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {durations.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d} s
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-2 block">Ratio</Label>
            <Select
              value={ratio}
              onValueChange={(v) => onRatioChange(v as VideoRatio)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VIDEO_RATIOS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-3">
          <SeedField
            seed={seed}
            onSeedChange={onSeedChange}
            onRandomize={onRandomizeSeed}
          />
        </div>

        <div
          className={
            audioSupported ? "mt-3 grid grid-cols-2 gap-2" : "mt-3 grid gap-2"
          }
        >
          <Toggle
            checked={cameraFixed}
            onChange={onCameraFixedChange}
            label="Fixed camera"
            hint="Disable pan / push-in"
          />
          {audioSupported ? (
            <Toggle
              checked={generateAudio}
              onChange={onGenerateAudioChange}
              label="Generate audio"
              hint="Native soundtrack"
            />
          ) : (
            <p className="font-mono text-[9px] uppercase tracking-[0.10em] leading-relaxed text-ink-dim">
              Audio off — one side doesn't support it.
            </p>
          )}
        </div>
      </Panel>
    </>
  );
}

/** Lightweight file drop / click-to-browse slot for the shared starting frame. */
function SharedFrameSlot({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 10 * 1024 * 1024) return; // 10 MB BytePlus cap
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  }
  return (
    <label className="group relative flex aspect-video cursor-pointer items-center justify-center overflow-hidden rounded-[10px] border border-dashed border-[var(--line-strong)] bg-panel transition-colors hover:border-ink">
      {value ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="starting frame"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onChange(null);
            }}
            className="absolute right-1.5 top-1.5 z-10 flex size-6 items-center justify-center rounded-full bg-black/70 text-ink hover:bg-black/85"
          >
            <X className="size-3" />
          </button>
        </>
      ) : (
        <div className="flex flex-col items-center gap-1.5 text-ink-dim">
          <span className="font-serif text-[34px] leading-none">+</span>
          <span className="font-mono text-[9px] uppercase tracking-[0.14em]">
            Upload frame
          </span>
        </div>
      )}
      <input
        type="file"
        accept="image/*"
        className="absolute inset-0 cursor-pointer opacity-0"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
    </label>
  );
}
