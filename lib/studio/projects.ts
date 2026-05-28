/**
 * Studio Spaces — multi-project store (localStorage).
 *
 * Schema v2 wraps the canvas in a project envelope so the user can keep
 * multiple workspaces side-by-side (a la Freepik's My Spaces). Every
 * project is fully self-contained: name, timestamps, optional template
 * provenance, and its own canvas snapshot.
 *
 * Migration from v1
 * -----------------
 *   v1 stored a single canvas under `lumen.studio.canvas.v1`. On the first
 *   read of v2, if v1 is present and v2 is empty, we wrap the v1 canvas
 *   into an "Untitled" project, persist it, then delete the v1 key. This
 *   runs idempotently and lazily — no side effects on import.
 */

const STORAGE_KEY = "lumen.studio.projects.v2";
const LEGACY_KEY = "lumen.studio.canvas.v1";

export type PersistedNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: { form: unknown };
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

export type ProjectMeta = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Provenance — the template id used at creation (or undefined for blank). */
  templateId?: string;
};

export type Project = ProjectMeta & {
  canvas: CanvasShape;
};

type StoreShape = {
  version: 2;
  projects: Record<string, Project>;
};

const EMPTY_STORE: StoreShape = { version: 2, projects: {} };

// ─────────────────────────── Storage I/O ───────────────────────────────

function readStore(): StoreShape {
  if (typeof window === "undefined") return EMPTY_STORE;
  // Always run migration first so subsequent reads see the merged state.
  migrateLegacyIfNeeded();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 2, projects: {} };
    const parsed = JSON.parse(raw) as StoreShape;
    if (parsed.version !== 2 || !parsed.projects) return EMPTY_STORE;
    return parsed;
  } catch {
    return EMPTY_STORE;
  }
}

function writeStore(store: StoreShape): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Quota exceeded, private mode, etc. Persistence is best-effort.
  }
  // Bust the snapshot cache and notify any subscribers (the dashboard
  // uses `useSyncExternalStore` to redraw after every mutation).
  cachedList = null;
  listeners.forEach((cb) => cb());
}

// ─────────────────────── Subscription / cache ───────────────────────────
//
// A tiny external store façade so React can subscribe via
// `useSyncExternalStore` without a setState-in-effect anti-pattern. The
// snapshot is cached to satisfy the hook's stable-identity requirement —
// `getSnapshot` MUST return the same array reference until something
// actually changed, otherwise React would treat every render as a fresh
// store update and infinite-loop.

type Listener = () => void;
const listeners = new Set<Listener>();
let cachedList: ProjectMeta[] | null = null;

export function subscribeProjects(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getProjectsSnapshot(): ProjectMeta[] {
  // Stable identity is required by `useSyncExternalStore` — recomputing
  // a fresh array on every call would loop the hook. Cache busts only
  // when `writeStore` runs (i.e. an actual mutation).
  if (cachedList === null) cachedList = listProjects();
  return cachedList;
}

/** SSR snapshot for `useSyncExternalStore`. Returns `null` (stable
 *  sentinel) so the server pass matches the dashboard's "loading…"
 *  skeleton, and React only swaps in the populated client snapshot once
 *  hydration has run. Avoids both a setState-in-effect anti-pattern and
 *  a flash of "empty state" on devices with cached projects. */
export function getProjectsServerSnapshot(): ProjectMeta[] | null {
  return null;
}

function migrateLegacyIfNeeded(): void {
  if (typeof window === "undefined") return;
  try {
    // If v2 already populated, nothing to do.
    const v2raw = localStorage.getItem(STORAGE_KEY);
    const v2 = v2raw ? (JSON.parse(v2raw) as StoreShape) : null;
    if (v2 && v2.projects && Object.keys(v2.projects).length > 0) return;

    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (!legacyRaw) return;
    const legacy = JSON.parse(legacyRaw) as {
      version: 1;
      nodes: PersistedNode[];
      edges: PersistedEdge[];
    };
    if (legacy?.version !== 1) {
      localStorage.removeItem(LEGACY_KEY);
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
      version: 2,
      projects: { [id]: project },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Legacy data corrupted — drop it silently. Worst case the user loses
    // their pre-v2 single canvas, but they would have lost it on the next
    // schema bump anyway.
  }
}

// ─────────────────────────── Public API ────────────────────────────────

export function listProjects(): ProjectMeta[] {
  const store = readStore();
  return Object.values(store.projects)
    .map<ProjectMeta>((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      templateId: p.templateId,
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
  // Skip the touch-update if nothing actually changed — the canvas autosave
  // fires on every node movement and would otherwise jitter `updatedAt` by
  // a few ms on every drag tick.
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
    canvas: deepCopyCanvas(src.canvas),
  });
}

// ─────────────────────────── Helpers ───────────────────────────────────

/** Time-prefixed base36 id — short, URL-safe, sorts by creation order. */
function newProjectId(): string {
  return (
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8)
  );
}

function deepCopyCanvas(canvas: CanvasShape): CanvasShape {
  // structuredClone is React 19 / Node 18+ standard and handles every shape
  // we ever put in `data.form` (strings, numbers, booleans, plain objects).
  return structuredClone(canvas);
}
