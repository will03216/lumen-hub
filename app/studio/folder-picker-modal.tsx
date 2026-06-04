"use client";

import { useEffect } from "react";
import { Folder, FolderPlus, FolderX, X } from "lucide-react";
import type { Folder as FolderType } from "@/lib/studio/projects";

type Props = {
  folders: FolderType[];
  currentFolderId?: string;
  projectName: string;
  onSelect: (folderId: string | null) => void;
  onClose: () => void;
};

/**
 * Modal for moving a project into a folder (or removing it from one).
 * Mirrors the TemplatePicker pattern: fixed overlay, Esc closes, backdrop click closes.
 */
export function FolderPickerModal({
  folders,
  currentFolderId,
  projectName,
  onSelect,
  onClose,
}: Props) {
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
        aria-label="Move to folder"
        className="relative w-full max-w-sm border border-border bg-bg-2"
      >
        <CornerTicks />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
              § Folder
            </span>
            <h2 className="font-serif text-[20px] italic text-ink">
              Move &ldquo;{projectName}&rdquo;
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

        {/* Folder list */}
        <div className="flex flex-col gap-1 p-4">
          {folders.length === 0 && (
            <p className="py-2 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-ink-mute">
              No folders yet — create one from the dashboard.
            </p>
          )}

          {folders.map((f) => {
            const isActive = f.id === currentFolderId;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onSelect(f.id)}
                className={`flex w-full items-center gap-3 border px-4 py-3 text-left transition-colors ${
                  isActive
                    ? "border-accent bg-panel text-ink"
                    : "border-border bg-panel text-ink-dim hover:border-accent hover:text-ink"
                }`}
              >
                <Folder className="size-4 shrink-0" />
                <span className="flex-1 truncate font-mono text-[12px] uppercase tracking-[0.12em]">
                  {f.name}
                </span>
                {isActive && (
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-accent">
                    Current
                  </span>
                )}
              </button>
            );
          })}

          {/* Remove from folder option (only shown when project is in a folder) */}
          {currentFolderId && (
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="flex w-full items-center gap-3 border border-border bg-panel px-4 py-3 text-left text-ink-dim transition-colors hover:border-[oklch(0.65_0.22_25)] hover:text-[oklch(0.78_0.20_25)]"
            >
              <FolderX className="size-4 shrink-0" />
              <span className="flex-1 font-mono text-[12px] uppercase tracking-[0.12em]">
                Remove from folder
              </span>
            </button>
          )}

          {folders.length === 0 && !currentFolderId && (
            <div className="flex flex-col items-center gap-2 py-4 text-ink-mute">
              <FolderPlus className="size-8" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

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
