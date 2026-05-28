"use client";

/**
 * ImageControls — the left-rail Panel pair (References + Format) used
 * when the active pair `kind` is "image".
 *
 * Pure presentational + dispatch — all state lives in the shell so the
 * URL serializer, ⌘↵ shortcut, and saved-pair picker can drive the same
 * inputs without prop-drilling React state across the boundary.
 *
 * Why both `refs` and `seed` flow through here:
 *   · refs are SHARED by both engines — that's the whole point of
 *     Compare being a fair test. Pulling them up into the shell keeps
 *     them out of per-side state where they could drift.
 *   · seed similarly. Same seed + same size + same prompt = the most
 *     deterministic A/B BytePlus exposes.
 *
 * Refs deliberately don't survive into the shareable URL; the shell
 * mentions the rationale in `pairs.ts`. The note inside Panel 02 is the
 * user-facing version of that constraint.
 */

import { Label } from "@/components/ui/label";
import { Panel } from "@/components/ui/panel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ReferenceImageInput,
  type RefImage,
} from "@/components/ui/reference-image-input";
import { IMAGE_SIZES, MAX_REF_IMAGES } from "@/lib/studio/models";
import { SeedField } from "./seed-field";

export function ImageControls({
  refs,
  onRefsChange,
  size,
  onSizeChange,
  seed,
  onSeedChange,
  onRandomizeSeed,
}: {
  refs: RefImage[];
  onRefsChange: (r: RefImage[]) => void;
  size: string;
  onSizeChange: (s: string) => void;
  seed: string;
  onSeedChange: (s: string) => void;
  onRandomizeSeed: () => void;
}) {
  return (
    <>
      <Panel index="02" title="Shared references">
        <ReferenceImageInput
          value={refs}
          onChange={onRefsChange}
          maxCount={MAX_REF_IMAGES}
          dense
        />
        <p className="mt-2 font-mono text-[10px] leading-relaxed tracking-[0.08em] text-ink-dim">
          Same refs feed both engines — the only way the comparison is fair.
          Refs live in session memory; shared URL carries prompt + pair only.
        </p>
      </Panel>

      <Panel index="03" title="Shared format">
        <Label className="mb-2 block">Size</Label>
        <Select value={size} onValueChange={onSizeChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {IMAGE_SIZES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="mt-3">
          <SeedField
            seed={seed}
            onSeedChange={onSeedChange}
            onRandomize={onRandomizeSeed}
          />
        </div>
      </Panel>
    </>
  );
}
