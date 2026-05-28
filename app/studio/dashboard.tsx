"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Plus, Sparkles } from "lucide-react";

import {
  createProject,
  deleteProject,
  duplicateProject,
  getProjectsServerSnapshot,
  getProjectsSnapshot,
  subscribeProjects,
  updateProject,
} from "@/lib/studio/projects";
import { findTemplate } from "@/lib/studio/templates";
import { ProjectCard } from "./project-card";
import { TemplatePicker } from "./template-picker";

/**
 * My Studio — landing page.
 *
 * Subscribes to the project store via `useSyncExternalStore` so the grid
 * stays in sync with mutations from anywhere in the page (rename, dup,
 * delete, picker → create) without a setState-in-effect dance. The SSR
 * snapshot intentionally returns `null` so the page hydrates against a
 * skeleton — devices that already have projects cached avoid a flash of
 * "empty state" before the client snapshot lands.
 *
 * Cross-tab sync (storage events) is deliberately out of scope for v1.
 */
export function Dashboard() {
  const router = useRouter();
  const projects = useSyncExternalStore(
    subscribeProjects,
    getProjectsSnapshot,
    getProjectsServerSnapshot,
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  const handlePickTemplate = useCallback(
    (templateId: string) => {
      const tpl = findTemplate(templateId);
      if (!tpl) return;
      const project = createProject({
        name: tpl.id === "blank" ? "Untitled" : tpl.name,
        templateId: tpl.id,
        canvas: tpl.build(),
      });
      setPickerOpen(false);
      router.push(`/studio/${project.id}`);
    },
    [router],
  );

  const handleRename = useCallback((id: string, currentName: string) => {
    // window.prompt is intentional: it's accessible, instantly familiar,
    // and avoids us building a full modal for a 60-character string. The
    // canvas itself has rich inline editing once you're inside.
    const next = window.prompt("Rename project", currentName);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === currentName) return;
    updateProject(id, { name: trimmed });
  }, []);

  const handleDuplicate = useCallback((id: string) => {
    duplicateProject(id);
  }, []);

  const handleDelete = useCallback((id: string, name: string) => {
    if (
      !window.confirm(
        `Delete "${name}"? This removes the canvas from this device. There is no undo.`,
      )
    ) {
      return;
    }
    deleteProject(id);
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.20em] text-accent">
            § My Studio
          </span>
          <h1 className="font-serif text-[40px] italic leading-[1.05] tracking-tight text-ink md:text-[52px]">
            Your canvases
          </h1>
          <p className="max-w-2xl text-[14px] text-ink-dim md:text-[15px]">
            Every project is its own node-graph workspace. Drafts, finished
            cuts, and one-off experiments all live here — saved locally to
            this device.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="inline-flex items-center gap-2 rounded-full border border-accent bg-accent px-5 py-2.5 font-mono text-[12px] uppercase tracking-[0.12em] text-accent-ink transition-opacity hover:opacity-95"
        >
          <Plus className="size-3.5" /> New project
        </button>
      </header>

      {projects === null ? (
        <SkeletonGrid />
      ) : projects.length === 0 ? (
        <EmptyState onNew={() => setPickerOpen(true)} />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onRename={() => handleRename(p.id, p.name)}
              onDuplicate={() => handleDuplicate(p.id)}
              onDelete={() => handleDelete(p.id, p.name)}
            />
          ))}
        </div>
      )}

      {pickerOpen && (
        <TemplatePicker
          onPick={handlePickTemplate}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="relative flex flex-col items-center justify-center gap-5 border border-dashed border-border bg-bg-2 px-6 py-20 text-center">
      <CornerTicks />
      <Sparkles className="size-7 text-accent" />
      <div className="flex flex-col gap-1">
        <p className="font-serif text-[24px] italic text-ink">
          No canvases yet
        </p>
        <p className="text-[14px] text-ink-dim">
          Start with a template — Cinematic Still, Quick Clip, Image → Video —
          or open a blank canvas.
        </p>
      </div>
      <button
        type="button"
        onClick={onNew}
        className="inline-flex items-center gap-2 rounded-full border border-accent bg-accent px-5 py-2.5 font-mono text-[12px] uppercase tracking-[0.12em] text-accent-ink transition-opacity hover:opacity-95"
      >
        <Plus className="size-3.5" /> New project
      </button>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="relative h-[224px] animate-pulse border border-border bg-bg-2"
        >
          <CornerTicks />
        </div>
      ))}
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
