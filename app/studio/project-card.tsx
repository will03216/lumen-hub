"use client";

import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import {
  Copy,
  Eye,
  Folder,
  GripVertical,
  Image as ImageIcon,
  Pencil,
  Trash2,
  Type,
  Video as VideoIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { getProject, type ProjectMeta } from "@/lib/studio/projects";
import { findTemplate } from "@/lib/studio/templates";

type Props = {
  project: ProjectMeta;
  folderName?: string;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: () => void;
};

export function ProjectCard({
  project,
  folderName,
  onRename,
  onDuplicate,
  onDelete,
  onMove,
}: Props) {
  const full = getProject(project.id);
  const nodes = full?.canvas.nodes ?? [];
  const edgeCount = full?.canvas.edges.length ?? 0;
  const template = project.templateId
    ? findTemplate(project.templateId)
    : undefined;

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: project.id,
    data: { project },
  });

  return (
    <div
      className={`group relative flex h-[224px] flex-col border border-border bg-bg-2 transition-colors hover:border-accent ${
        isDragging ? "opacity-40 ring-1 ring-accent" : ""
      }`}
    >
      <CornerTicks />

      {/* Navigation overlay — covers the whole card; buttons above it intercept clicks */}
      <Link
        href={`/studio/${project.id}`}
        aria-label={`Open ${project.name}`}
        className="absolute inset-0"
      />

      {/* Top half — pointer-events-none so the absolute Link underneath receives clicks */}
      <div className="relative flex flex-1 flex-col justify-between p-4 pointer-events-none">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {template ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-panel px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
                {template.badge} · {template.name}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-panel px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-mute">
                Custom
              </span>
            )}
            {folderName && (
              <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-accent">
                <Folder className="size-2.5" />
                {folderName}
              </span>
            )}
          </div>
          <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-mute">
            {nodes.length} · {edgeCount}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {nodes.length === 0 ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-mute">
              empty canvas
            </span>
          ) : (
            nodes.slice(0, 12).map((n, i) => (
              <NodeChip key={`${n.id}-${i}`} type={n.type} />
            ))
          )}
          {nodes.length > 12 && (
            <span className="font-mono text-[10px] tracking-[0.10em] text-ink-mute">
              +{nodes.length - 12}
            </span>
          )}
        </div>
      </div>

      {/* Bottom half — name is pointer-events-none (link handles it); buttons are auto */}
      <div className="relative flex items-end justify-between gap-3 border-t border-border bg-panel/50 px-4 py-3">
        <div className="pointer-events-none min-w-0 flex-1">
          <p className="truncate font-serif text-[16px] italic text-ink">
            {project.name}
          </p>
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-mute">
            Edited {formatRelative(project.updatedAt)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
          <button
            ref={setNodeRef}
            type="button"
            aria-label="Drag to move into folder"
            title="Drag to move into folder"
            {...attributes}
            {...listeners}
            className="inline-flex size-7 cursor-grab items-center justify-center rounded-full border border-border bg-panel text-ink-dim transition-colors hover:border-accent hover:text-accent active:cursor-grabbing"
          >
            <GripVertical className="size-3.5" />
          </button>
          <ActionIcon icon={Pencil} label="Rename" onClick={onRename} />
          <ActionIcon icon={Copy} label="Duplicate" onClick={onDuplicate} />
          <ActionIcon icon={Folder} label="Move to folder" onClick={onMove} />
          <ActionIcon icon={Trash2} label="Delete" onClick={onDelete} danger />
        </div>
      </div>
    </div>
  );
}

function NodeChip({ type }: { type: string }) {
  const meta = NODE_META[type];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span
      title={meta.label}
      className="inline-flex size-6 items-center justify-center rounded-full border border-border bg-panel text-ink-dim"
    >
      <Icon className="size-3" />
    </span>
  );
}

const NODE_META: Record<string, { label: string; icon: LucideIcon }> = {
  textPrompt: { label: "Text Prompt", icon: Type },
  imageGen: { label: "Image Gen", icon: ImageIcon },
  videoGen: { label: "Video Gen", icon: VideoIcon },
  preview: { label: "Preview", icon: Eye },
};

function ActionIcon({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={
        danger
          ? "inline-flex size-7 items-center justify-center rounded-full border border-border bg-panel text-ink-dim transition-colors hover:border-[oklch(0.65_0.22_25)] hover:text-[oklch(0.78_0.20_25)]"
          : "inline-flex size-7 items-center justify-center rounded-full border border-border bg-panel text-ink-dim transition-colors hover:border-accent hover:text-accent"
      }
    >
      <Icon className="size-3.5" />
    </button>
  );
}

function CornerTicks() {
  return (
    <>
      <span className="pointer-events-none absolute -left-px -top-px size-2 border-l border-t border-accent opacity-0 transition-opacity group-hover:opacity-100" />
      <span className="pointer-events-none absolute -right-px -top-px size-2 border-r border-t border-accent opacity-0 transition-opacity group-hover:opacity-100" />
      <span className="pointer-events-none absolute -bottom-px -left-px size-2 border-b border-l border-accent opacity-0 transition-opacity group-hover:opacity-100" />
      <span className="pointer-events-none absolute -bottom-px -right-px size-2 border-b border-r border-accent opacity-0 transition-opacity group-hover:opacity-100" />
    </>
  );
}

function formatRelative(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const sec = Math.round(diffMs / 1000);
  if (sec < 30) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  const d = new Date(timestamp);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}
