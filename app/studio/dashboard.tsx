"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Folder, FolderPlus, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";

import {
  createFolder,
  createProject,
  deleteFolder,
  deleteProject,
  duplicateProject,
  getFoldersServerSnapshot,
  getFoldersSnapshot,
  getProjectsServerSnapshot,
  getProjectsSnapshot,
  moveProjectToFolder,
  renameFolder,
  subscribeProjects,
  updateProject,
  type Folder as FolderType,
  type ProjectMeta,
} from "@/lib/studio/projects";
import { findTemplate } from "@/lib/studio/templates";
import { ProjectCard } from "./project-card";
import { TemplatePicker } from "./template-picker";
import { FolderPickerModal } from "./folder-picker-modal";

/**
 * My Studio — landing page.
 *
 * Subscribes to both the project store and folder store via
 * `useSyncExternalStore` (they share the same listener set). A folder tab
 * strip above the grid lets the user filter by folder; "All" shows everything.
 */
export function Dashboard() {
  const router = useRouter();
  const projects = useSyncExternalStore(
    subscribeProjects,
    getProjectsSnapshot,
    getProjectsServerSnapshot,
  );
  const folders = useSyncExternalStore(
    subscribeProjects,
    getFoldersSnapshot,
    getFoldersServerSnapshot,
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState<string | "all">("all");
  // Project being dragged right now (for DragOverlay rendering)
  const [draggingProject, setDraggingProject] = useState<ProjectMeta | null>(null);
  // { projectId, projectName, currentFolderId } when the move modal is open
  const [moveTarget, setMoveTarget] = useState<{
    projectId: string;
    projectName: string;
    currentFolderId?: string;
  } | null>(null);

  // If the active folder gets deleted, fall back to "all".
  useEffect(() => {
    if (
      activeFolderId !== "all" &&
      folders !== null &&
      !folders.find((f) => f.id === activeFolderId)
    ) {
      setActiveFolderId("all");
    }
  }, [folders, activeFolderId]);

  const handlePickTemplate = useCallback(
    (templateId: string) => {
      const tpl = findTemplate(templateId);
      if (!tpl) return;
      const project = createProject({
        name: tpl.id === "blank" ? "Untitled" : tpl.name,
        templateId: tpl.id,
        canvas: tpl.build(),
        folderId: activeFolderId !== "all" ? activeFolderId : undefined,
      });
      setPickerOpen(false);
      router.push(`/studio/${project.id}`);
    },
    [router, activeFolderId],
  );

  const handleRename = useCallback((id: string, currentName: string) => {
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

  const handleMove = useCallback((project: ProjectMeta) => {
    setMoveTarget({
      projectId: project.id,
      projectName: project.name,
      currentFolderId: project.folderId,
    });
  }, []);

  const handleMoveSelect = useCallback(
    (folderId: string | null) => {
      if (!moveTarget) return;
      moveProjectToFolder(moveTarget.projectId, folderId);
      setMoveTarget(null);
    },
    [moveTarget],
  );

  const handleCreateFolder = useCallback(() => {
    const name = window.prompt("Folder name");
    if (!name) return;
    const folder = createFolder(name);
    setActiveFolderId(folder.id);
  }, []);

  const handleRenameFolder = useCallback(
    (e: React.MouseEvent, folder: FolderType) => {
      e.stopPropagation();
      const next = window.prompt("Rename folder", folder.name);
      if (!next) return;
      const trimmed = next.trim();
      if (!trimmed || trimmed === folder.name) return;
      renameFolder(folder.id, trimmed);
    },
    [],
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const project = event.active.data.current?.project as ProjectMeta | undefined;
      setDraggingProject(project ?? null);
    },
    [],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDraggingProject(null);
      const { active, over } = event;
      if (!over) return;
      moveProjectToFolder(String(active.id), String(over.id));
    },
    [],
  );

  const handleDeleteFolder = useCallback(
    (e: React.MouseEvent, folder: FolderType) => {
      e.stopPropagation();
      if (
        !window.confirm(
          `Delete folder "${folder.name}"? Projects inside will become unfiled. There is no undo.`,
        )
      )
        return;
      deleteFolder(folder.id);
    },
    [],
  );

  const visibleProjects =
    projects === null
      ? null
      : activeFolderId === "all"
        ? projects
        : projects.filter((p) => p.folderId === activeFolderId);

  const folderMap = new Map<string, FolderType>(
    folders?.map((f) => [f.id, f]) ?? [],
  );

  const hasFolders = folders !== null && folders.length > 0;

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

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCreateFolder}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-panel px-5 py-2.5 font-mono text-[12px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:border-accent hover:text-accent"
          >
            <FolderPlus className="size-3.5" /> New folder
          </button>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-2 rounded-full border border-accent bg-accent px-5 py-2.5 font-mono text-[12px] uppercase tracking-[0.12em] text-accent-ink transition-opacity hover:opacity-95"
          >
            <Plus className="size-3.5" /> New project
          </button>
        </div>
      </header>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* Folder tab strip — only rendered once folders exist */}
        {hasFolders && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <FolderTab
              id="__all__"
              active={activeFolderId === "all"}
              isDropTarget={false}
              onClick={() => setActiveFolderId("all")}
            >
              All
            </FolderTab>
            {folders.map((f) => (
              <FolderTab
                key={f.id}
                id={f.id}
                active={activeFolderId === f.id}
                isDropTarget
                onClick={() => setActiveFolderId(f.id)}
                onRename={(e) => handleRenameFolder(e, f)}
                onDelete={(e) => handleDeleteFolder(e, f)}
              >
                {f.name}
              </FolderTab>
            ))}
          </div>
        )}

        {visibleProjects === null ? (
          <SkeletonGrid />
        ) : visibleProjects.length === 0 ? (
          <EmptyState
            onNew={() => setPickerOpen(true)}
            folderName={
              activeFolderId !== "all"
                ? folderMap.get(activeFolderId)?.name
                : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleProjects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                folderName={
                  activeFolderId === "all" && p.folderId
                    ? folderMap.get(p.folderId)?.name
                    : undefined
                }
                onRename={() => handleRename(p.id, p.name)}
                onDuplicate={() => handleDuplicate(p.id)}
                onDelete={() => handleDelete(p.id, p.name)}
                onMove={() => handleMove(p)}
              />
            ))}
          </div>
        )}

        {/* Floating card that follows the cursor while dragging */}
        <DragOverlay dropAnimation={{ duration: 200, easing: "ease-out" }}>
          {draggingProject ? (
            <OverlayCard project={draggingProject} />
          ) : null}
        </DragOverlay>
      </DndContext>

      {pickerOpen && (
        <TemplatePicker
          onPick={handlePickTemplate}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {moveTarget && folders !== null && (
        <FolderPickerModal
          folders={folders}
          currentFolderId={moveTarget.currentFolderId}
          projectName={moveTarget.projectName}
          onSelect={handleMoveSelect}
          onClose={() => setMoveTarget(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────── Folder Tab ────────────────────────────────────

type FolderTabProps = {
  id: string;
  active: boolean;
  isDropTarget: boolean;
  onClick: () => void;
  onRename?: (e: React.MouseEvent) => void;
  onDelete?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
};

function FolderTab({
  id,
  active,
  isDropTarget,
  onClick,
  onRename,
  onDelete,
  children,
}: FolderTabProps) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !isDropTarget });
  const dragOver = isDropTarget && isOver;

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      className={`group inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-all duration-150 ${
        dragOver
          ? "scale-110 border-accent bg-accent text-accent-ink shadow-[0_0_16px_2px_oklch(var(--accent)/0.4)]"
          : active
            ? "border-accent bg-accent text-accent-ink"
            : "border-border bg-panel text-ink-dim hover:border-accent hover:text-ink"
      }`}
    >
      <Folder className="size-3" />
      {children}
      {/* Rename / delete icons shown on active or hover */}
      {(onRename || onDelete) && (
        <span className={`flex items-center gap-1 ${active ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-60"} transition-opacity`}>
          {onRename && (
            <span
              role="button"
              aria-label="Rename folder"
              onClick={onRename}
              className="inline-flex size-4 items-center justify-center rounded-full hover:text-inherit"
            >
              <Pencil className="size-2.5" />
            </span>
          )}
          {onDelete && (
            <span
              role="button"
              aria-label="Delete folder"
              onClick={onDelete}
              className="inline-flex size-4 items-center justify-center rounded-full hover:text-[oklch(0.78_0.20_25)]"
            >
              <Trash2 className="size-2.5" />
            </span>
          )}
        </span>
      )}
    </button>
  );
}

// ─────────────────────── Empty / Loading states ─────────────────────────

function EmptyState({
  onNew,
  folderName,
}: {
  onNew: () => void;
  folderName?: string;
}) {
  return (
    <div className="relative flex flex-col items-center justify-center gap-5 border border-dashed border-border bg-bg-2 px-6 py-20 text-center">
      <CornerTicks />
      {folderName ? (
        <Folder className="size-7 text-accent" />
      ) : (
        <Sparkles className="size-7 text-accent" />
      )}
      <div className="flex flex-col gap-1">
        <p className="font-serif text-[24px] italic text-ink">
          {folderName ? `"${folderName}" is empty` : "No canvases yet"}
        </p>
        <p className="text-[14px] text-ink-dim">
          {folderName
            ? "Create a new project — it will be filed here automatically."
            : "Start with a template — Cinematic Still, Quick Clip, Image → Video — or open a blank canvas."}
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

// ─────────────────────── Drag overlay card ─────────────────────────────

function OverlayCard({ project }: { project: ProjectMeta }) {
  return (
    <div className="flex h-16 w-64 cursor-grabbing items-center gap-3 border border-accent bg-bg-2 px-4 shadow-[0_8px_32px_rgba(0,0,0,0.45)] ring-1 ring-accent/30">
      <Folder className="size-4 shrink-0 text-accent" />
      <p className="flex-1 truncate font-serif text-[15px] italic text-ink">
        {project.name}
      </p>
    </div>
  );
}
