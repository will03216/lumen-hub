"use client";

/**
 * SidebarTabs — kind switcher at the top of the /generate sidebar.
 *
 * Replaces the wide horizontal Tabs strip that used to sit under the
 * page hero. Three button segments (Image / Video / Audio), icon +
 * label, active item carries the accent colour. Fully controlled —
 * `GenerateShell` owns the state.
 */

import * as React from "react";
import { Image as ImageIcon, Film, AudioLines } from "lucide-react";
import { cn } from "@/lib/utils";

export type GenerateKind = "image" | "video" | "audio";

const TABS: Array<{ id: GenerateKind; label: string; Icon: React.ElementType }> =
  [
    { id: "image", label: "Image", Icon: ImageIcon },
    { id: "video", label: "Video", Icon: Film },
    { id: "audio", label: "Audio", Icon: AudioLines },
  ];

export function SidebarTabs({
  value,
  onChange,
}: {
  value: GenerateKind;
  onChange: (next: GenerateKind) => void;
}) {
  return (
    // Sticky inside the sidebar scroll area so the kind switcher
    // stays reachable while panels below scroll. The bg matches the
    // page so scrolled-under panel chrome doesn't bleed through.
    <div className="sticky top-0 z-10 grid grid-cols-3 gap-1.5 rounded-[12px] border border-border bg-panel p-1.5">
      {TABS.map(({ id, label, Icon }) => {
        const active = id === value;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-[8px] px-2 py-2 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors cursor-pointer",
              active
                ? "bg-accent text-bg"
                : "text-ink-dim hover:bg-bg-2 hover:text-ink",
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
