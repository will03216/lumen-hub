/**
 * Studio Spaces — multi-project store (localStorage).
 *
 * Schema v3 adds folders so projects can be grouped per customer / campaign.
 * Each folder is a lightweight record; projects carry an optional `folderId`
 * foreign-key. All writes go through `writeStore` which busts the snapshot
 * cache and notifies `useSyncExternalStore` subscribers.
 *
 * Migration chain
 * ---------------
 *   v1 → v2  Single canvas → multi-project envelope (see v2 notes)
 *   v2 → v3  Adds `folders: {}` to the store; projects gain optional `folderId`
 */

import { userKey } from '@/lib/storage-user';

const STORAGE_KEY = () => userKey("lumen.studio.projects.v3");
const V2_KEY = () => userKey("lumen.studio.projects.v2");
const LEGACY_KEY = () => userKey("lumen.studio.canvas.v1");

// ─────────────────────────── Types ─────────────────────────────────────

export type PersistedNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    form: unknown;
    outputs?: Record<string, string | undefined>;
    lastRunHash?: string;
    status?: "idle" | "succeeded" | "failed";
  };
};

export type PersistedEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

export type CanvasShape = {
  nodes: PersistedNode[];
  edges: PersistedEdge[];
};

export type Folder = {
  id: string;
  name: string;
  createdAt: number;
};

export type ProjectMeta = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Provenance — the template id used at creation (or undefined for blank). */
  templateId?: string;
  /** Folder this project belongs to (undefined = unfiled). */
  folderId?: string;
};

export type Project = ProjectMeta & {
  canvas: CanvasShape;
};

type StoreShape = {
  version: 3;
  projects: Record<string, Project>;
  folders: Record<string, Folder>;
};

const EMPTY_STORE: StoreShape = { version: 3, projects: {}, folders: {} };

// ─────────────────────────── Storage I/O ───────────────────────────────

function readStore(): StoreShape {
  if (typeof window === "undefined") return EMPTY_STORE;
  migrateLegacyIfNeeded();
  try {
    const raw = localStorage.getItem(STORAGE_KEY());
    if (!raw) return { version: 3, projects: {}, folders: {} };
    const parsed = JSON.parse(raw) as StoreShape;
    if (parsed.version !== 3 || !parsed.projects) return EMPTY_STORE;
    return { ...parsed, folders: parsed.folders ?? {} };
  } catch {
    return EMPTY_STORE;
  }
}

function writeStore(store: StoreShape): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY(), JSON.stringify(store));
  } catch {
    // Quota exceeded, private mode, etc. Persistence is best-effort.
  }
  cachedList = null;
  cachedFolders = null;
  listeners.forEach((cb) => cb());
}

// ─────────────────────── Subscription / cache ───────────────────────────

type Listener = () => void;
const listeners = new Set<Listener>();
let cachedList: ProjectMeta[] | null = null;
let cachedFolders: Folder[] | null = null;

export function subscribeProjects(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getProjectsSnapshot(): ProjectMeta[] {
  if (cachedList === null) cachedList = listProjects();
  return cachedList;
}

export function getProjectsServerSnapshot(): ProjectMeta[] | null {
  return null;
}

export function getFoldersSnapshot(): Folder[] {
  if (cachedFolders === null) cachedFolders = listFolders();
  return cachedFolders;
}

export function getFoldersServerSnapshot(): Folder[] | null {
  return null;
}

// ─────────────────────── Migration ─────────────────────────────────────

function migrateLegacyIfNeeded(): void {
  if (typeof window === "undefined") return;
  try {
    // If v3 already has data, nothing to do.
    const v3raw = localStorage.getItem(STORAGE_KEY());
    const v3 = v3raw ? (JSON.parse(v3raw) as StoreShape) : null;
    if (v3 && v3.projects && Object.keys(v3.projects).length > 0) return;

    // Migrate from v2 (multi-project, no folders)
    const v2raw = localStorage.getItem(V2_KEY());
    if (v2raw) {
      const v2 = JSON.parse(v2raw) as { version: 2; projects: Record<string, Project> };
      if (v2?.version === 2 && v2.projects) {
        const store: StoreShape = {
          version: 3,
          projects: v2.projects,
          folders: {},
        };
        localStorage.setItem(STORAGE_KEY(), JSON.stringify(store));
        return;
      }
    }

    // Migrate from v1 (single canvas)
    const legacyRaw = localStorage.getItem(LEGACY_KEY());
    if (!legacyRaw) return;
    const legacy = JSON.parse(legacyRaw) as {
      version: 1;
      nodes: PersistedNode[];
      edges: PersistedEdge[];
    };
    if (legacy?.version !== 1) {
      localStorage.removeItem(LEGACY_KEY());
      return;
    }

    const now = Date.now();
    const id = newProjectId();
    const project: Project = {
      id,
      name: "Untitled",
      createdAt: now,
      updatedAt: now,
      canvas: { nodes: legacy.nodes ?? [], edges: legacy.edges ?? [] },
    };
    const store: StoreShape = {
      version: 3,
      projects: { [id]: project },
      folders: {},
    };
    localStorage.setItem(STORAGE_KEY(), JSON.stringify(store));
    localStorage.removeItem(LEGACY_KEY());
  } catch {
    // Legacy data corrupted — drop it silently.
  }
}

// ─────────────────────────── Project API ───────────────────────────────

export function listProjects(): ProjectMeta[] {
  const store = readStore();
  return Object.values(store.projects)
    .map<ProjectMeta>((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      templateId: p.templateId,
      folderId: p.folderId,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getProject(id: string): Project | null {
  const store = readStore();
  return store.projects[id] ?? null;
}

export function createProject(opts: {
  name?: string;
  templateId?: string;
  canvas?: CanvasShape;
  folderId?: string;
} = {}): Project {
  const store = readStore();
  const now = Date.now();
  const id = newProjectId();
  const project: Project = {
    id,
    name: opts.name?.trim() || "Untitled",
    createdAt: now,
    updatedAt: now,
    templateId: opts.templateId,
    folderId: opts.folderId,
    canvas: opts.canvas ?? { nodes: [], edges: [] },
  };
  store.projects[id] = project;
  writeStore(store);
  return project;
}

export function updateProject(
  id: string,
  patch: { name?: string; canvas?: CanvasShape },
): Project | null {
  const store = readStore();
  const existing = store.projects[id];
  if (!existing) return null;
  const next: Project = {
    ...existing,
    ...(patch.name !== undefined ? { name: patch.name.trim() || "Untitled" } : {}),
    ...(patch.canvas !== undefined ? { canvas: patch.canvas } : {}),
    updatedAt: Date.now(),
  };
  store.projects[id] = next;
  writeStore(store);
  return next;
}

export function deleteProject(id: string): void {
  const store = readStore();
  if (!store.projects[id]) return;
  delete store.projects[id];
  writeStore(store);
}

export function duplicateProject(id: string): Project | null {
  const src = getProject(id);
  if (!src) return null;
  return createProject({
    name: `${src.name} (copy)`,
    templateId: src.templateId,
    folderId: src.folderId,
    canvas: deepCopyCanvas(src.canvas),
  });
}

export function moveProjectToFolder(
  projectId: string,
  folderId: string | null,
): void {
  const store = readStore();
  const project = store.projects[projectId];
  if (!project) return;
  store.projects[projectId] = {
    ...project,
    folderId: folderId ?? undefined,
    updatedAt: Date.now(),
  };
  writeStore(store);
}

// ─────────────────────────── Folder API ────────────────────────────────

export function listFolders(): Folder[] {
  const store = readStore();
  return Object.values(store.folders).sort((a, b) => a.createdAt - b.createdAt);
}

export function createFolder(name: string): Folder {
  const store = readStore();
  const folder: Folder = {
    id: newProjectId(),
    name: name.trim() || "Untitled Folder",
    createdAt: Date.now(),
  };
  store.folders[folder.id] = folder;
  writeStore(store);
  return folder;
}

export function renameFolder(id: string, name: string): void {
  const store = readStore();
  const folder = store.folders[id];
  if (!folder) return;
  store.folders[id] = { ...folder, name: name.trim() || folder.name };
  writeStore(store);
}

export function deleteFolder(id: string): void {
  const store = readStore();
  if (!store.folders[id]) return;
  delete store.folders[id];
  // Unassign all projects that belonged to this folder.
  for (const project of Object.values(store.projects)) {
    if (project.folderId === id) {
      store.projects[project.id] = { ...project, folderId: undefined };
    }
  }
  writeStore(store);
}

// ─────────────────────────── Helpers ───────────────────────────────────

/** Time-prefixed base36 id — short, URL-safe, sorts by creation order. */
function newProjectId(): string {
  return (
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8)
  );
}

function deepCopyCanvas(canvas: CanvasShape): CanvasShape {
  return structuredClone(canvas);
}
