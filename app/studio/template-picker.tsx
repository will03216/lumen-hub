"use client";

import { useEffect } from "react";
import { Eye, FileText, Globe, Image as ImageIcon, Sparkles, Type, Video as VideoIcon, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { TEMPLATES, type StudioTemplate } from "@/lib/studio/templates";

type Props = {
  onPick: (templateId: string) => void;
  onClose: () => void;
};

/**
 * Template picker modal — opens from the dashboard's "+ New project" CTA.
 *
 * Renders a fixed-overlay backdrop with a scrollable card grid. Closes on
 * Escape, on backdrop click, or on the explicit close button. Picking a
 * template fires `onPick(templateId)`, the dashboard then creates the
 * project + navigates to the canvas.
 */
export function TemplatePicker({ onPick, onClose }: Props) {
  // Esc closes the picker. We add the listener once per mount and keep
  // the body scroll-locked so the dashboard underneath can't jitter.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const sorted = [...TEMPLATES].sort((a, b) => a.order - b.order);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-10"
      onClick={onClose}
      style={{ background: "rgba(5,5,10,0.78)", backdropFilter: "blur(8px)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Pick a template"
        className="relative max-h-full w-full max-w-[920px] overflow-y-auto border border-border bg-bg-2"
      >
        <CornerTicks />
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
              § Templates
            </span>
            <h2 className="font-serif text-[26px] italic text-ink">
              Pick a starting point
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-8 items-center justify-center rounded-full border border-border bg-panel text-ink-dim transition-colors hover:border-accent hover:text-accent"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2">
          {sorted.map((t) => (
            <TemplateCard key={t.id} template={t} onPick={() => onPick(t.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function TemplateCard({
  template,
  onPick,
}: {
  template: StudioTemplate;
  onPick: () => void;
}) {
  const isBlank = template.id === "blank";
  return (
    <button
      type="button"
      onClick={onPick}
      className="group relative flex flex-col gap-4 border border-border bg-panel p-5 text-left transition-colors hover:border-accent"
    >
      <CornerTicks />
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-2 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
          {isBlank ? <Sparkles className="size-3" /> : null}
          {template.badge}
        </span>
        <FlowPreview templateId={template.id} />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="font-serif text-[20px] italic text-ink">
          {template.name}
        </span>
        <p className="text-[13px] leading-snug text-ink-dim">
          {template.description}
        </p>
      </div>
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-mute group-hover:text-accent">
        Use template →
      </span>
    </button>
  );
}

/** Tiny visual: a horizontal strip of icons + arrows that hints at the
 *  template's pipeline shape. Hand-rolled per template id so we don't
 *  have to inspect the canvas to render the right glyph order. */
function FlowPreview({ templateId }: { templateId: string }) {
  const sequence = TEMPLATE_FLOWS[templateId];
  if (!sequence || sequence.length === 0) return null;
  return (
    <div className="flex items-center gap-1">
      {sequence.map((entry, i) => {
        const Icon = entry.icon;
        return (
          <div key={i} className="flex items-center gap-1">
            {i > 0 && (
              <span className="font-mono text-[10px] text-ink-mute">→</span>
            )}
            <span className="inline-flex size-6 items-center justify-center rounded-full border border-border bg-bg-2 text-ink-dim group-hover:border-accent group-hover:text-accent">
              <Icon className="size-3" />
            </span>
          </div>
        );
      })}
    </div>
  );
}

const TEMPLATE_FLOWS: Record<string, Array<{ icon: LucideIcon }>> = {
  blank: [],
  "cinematic-still": [
    { icon: Type },
    { icon: ImageIcon },
    { icon: Eye },
  ],
  "quick-clip": [
    { icon: Type },
    { icon: VideoIcon },
    { icon: Eye },
  ],
  "image-to-video": [
    { icon: Type },
    { icon: ImageIcon },
    { icon: VideoIcon },
    { icon: Eye },
  ],
  "article-narration": [
    { icon: Globe },
    { icon: FileText },
    { icon: VideoIcon },
  ],
};

function CornerTicks() {
  return (
    <>
      <span className="pointer-events-none absolute -left-px -top-px size-2 border-l border-t border-accent" />
      <span className="pointer-events-none absolute -right-px -top-px size-2 border-r border-t border-accent" />
      <span className="pointer-events-none absolute -bottom-px -left-px size-2 border-b border-l border-accent" />
      <span className="pointer-events-none absolute -bottom-px -right-px size-2 border-b border-r border-accent" />
    </>
  );
}
