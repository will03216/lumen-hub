/**
 * Library — local asset store.
 *
 * This is the persistence layer for §44's "Digital Assets" pillar. Every
 * Generator and Canvas render lands here, plus user uploads and imports.
 *
 * Storage choice
 * --------------
 * localStorage, mirroring the existing `lib/studio/projects.ts` pattern
 * (same `useSyncExternalStore` integration, same shape of subscribe/
 * snapshot). Asset records hold metadata + remote URLs only — bytes live
 * on whichever CDN minted them — so the 5MB quota is room for thousands
 * of records before we'd need to graduate to IndexedDB.
 *
 * Migration to IndexedDB stays straightforward when needed: the public
 * API here is intentionally async-shaped only where it matters (`add`
 * is sync because the in-memory cache is the source of truth between
 * mutations and writes are fire-and-forget for the localStorage tier).
 *
 * Lineage
 * -------
 * `derivedFrom` and `projectId` give us the lineage links the
 * "remix this image" / "open in Canvas" UX needs. Not exercised in §44
 * but baked into the schema so future commits don't migrate again.
 */

const STORAGE_KEY = "lumen.library.assets.v1";

export type AssetKind = "image" | "video" | "audio" | "reference";
export type AssetSource = "generated" | "uploaded" | "imported";

export type MirrorStatus = "pending" | "mirrored" | "failed";

export type Asset = {
  id: string;
  kind: AssetKind;
  /** CDN URL (BytePlus / R2) or data: URI for small uploads. Kept even
   *  after a successful mirror — useful for lineage ("which BytePlus
   *  task minted this") and as a fallback while the mirror is in flight. */
  url: string;
  /** Local same-origin path to the mirrored copy, e.g.
   *  `/library-cache/<id>.png`. Set by §48's mirror flow once the
   *  BytePlus CDN bytes have been streamed onto disk. The display layer
   *  prefers this URL over `url` so the asset stays alive after the
   *  upstream signed URL expires. */
  mirrorUrl?: string;
  /** Lifecycle of the mirror request. `pending` while the server is
   *  downloading; `mirrored` once `mirrorUrl` is populated; `failed`
   *  when the upstream wouldn't serve the bytes. Absent for assets that
   *  don't need mirroring (data: URIs, already-local references). */
  mirrorStatus?: MirrorStatus;
  /** Optional poster for videos; falls back to first-frame at render time
   *  when absent. */
  thumbUrl?: string;
  source: AssetSource;
  createdAt: number;
  updatedAt: number;

  // Generation metadata — populated when source === "generated"
  prompt?: string;
  model?: string;
  seed?: number;
  /** "2048x2048" for images, free-form for downstream consumers. */
  size?: string;
  /** "16:9" for videos, also used by image breadcrumbs. */
  ratio?: string;
  /** Seconds for videos. */
  duration?: number;
  /** Free-form bag for engine-specific knobs (resolution, audio flag,
   *  camerafixed, etc.). Stored verbatim so re-runs can hydrate exactly. */
  params?: Record<string, unknown>;

  // Organization
  tags: string[];
  pinned: boolean;

  // Lineage
  /** Parent asset id — set by remix flows. */
  derivedFrom?: string;
  /** Studio project id when produced from a canvas Preview node. */
  projectId?: string;
  /** User-overridable display title. Falls back to truncated prompt. */
  title?: string;

  // BytePlus ModelArk Asset Library
  /** The BytePlus GroupId this asset has been registered into. */
  byteplusGroupId?: string;
  /** The BytePlus asset_id returned by CreateAsset. Present once registered. */
  byteplusAssetId?: string;
  /** Registration lifecycle — absent means not yet registered with BytePlus. */
  byteplusStatus?: "pending" | "active" | "failed";
};

type StoreShape = {
  version: 1;
  assets: Record<string, Asset>;
};

const EMPTY_STORE: StoreShape = { version: 1, assets: {} };

// ─────────────────────────── Storage I/O ───────────────────────────────

function readStore(): StoreShape {
  if (typeof window === "undefined") return EMPTY_STORE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, assets: {} };
    const parsed = JSON.parse(raw) as StoreShape;
    if (parsed.version !== 1 || !parsed.assets) return EMPTY_STORE;
    return parsed;
  } catch {
    return EMPTY_STORE;
  }
}

function writeStore(store: StoreShape): void {
  if (typeof window === "undefined") return;
  // TODO(perf): swap to IndexedDB once asset count exceeds ~500.
  // JSON.stringify of the full store on every mutation is O(n) and
  // runs synchronously inside addAsset — fine for hundreds of records,
  // not for thousands. The migration path is straight: replace this
  // body with an idb-keyval put, keep the rest of the API.
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Quota / serialization failures swallowed by design — we'd rather
    // drop a write than crash the page; the in-memory cache still has
    // the latest value for this session.
  }
}

// ─────────────────────────── In-memory cache ───────────────────────────
// Same shape as `lib/studio/projects.ts`: cache the parsed store once,
// invalidate on every mutation, and feed `useSyncExternalStore` from the
// cache so React doesn't re-parse JSON on every render.

let cache: StoreShape | null = null;
type Listener = () => void;
const listeners = new Set<Listener>();

function getCached(): StoreShape {
  if (!cache) cache = readStore();
  return cache;
}

function commit(next: StoreShape): void {
  cache = next;
  writeStore(next);
  for (const fn of listeners) fn();
}

// ─────────────────────────── Public API ────────────────────────────────

export type CreateAssetInput = Omit<
  Asset,
  "id" | "createdAt" | "updatedAt" | "tags" | "pinned"
> & {
  /** Optional id override — used by tests and by callers that want
   *  idempotent inserts (e.g. "save this render once even if its hook
   *  fires twice"). */
  id?: string;
  tags?: string[];
  pinned?: boolean;
};

export function addAsset(input: CreateAssetInput): Asset {
  const now = Date.now();
  const id = input.id ?? cryptoId();
  const existing = getCached().assets[id];
  const asset: Asset = {
    ...input,
    id,
    tags: input.tags ?? [],
    pinned: input.pinned ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const store = getCached();
  commit({
    ...store,
    assets: { ...store.assets, [id]: asset },
  });
  // Cloud mirror — fires only when the user is signed in (see asset-sync.ts).
  // Dynamic import keeps the supabase client out of the bundle for users
  // who never enable cloud sync.
  void cloudUpsert(asset);
  return asset;
}

export function updateAsset(
  id: string,
  patch: Partial<Omit<Asset, "id" | "createdAt">>,
): Asset | null {
  const store = getCached();
  const existing = store.assets[id];
  if (!existing) return null;
  const next: Asset = { ...existing, ...patch, id, updatedAt: Date.now() };
  commit({ ...store, assets: { ...store.assets, [id]: next } });
  void cloudUpsert(next);
  return next;
}

export function removeAsset(id: string): boolean {
  const store = getCached();
  if (!store.assets[id]) return false;
  const { [id]: _, ...rest } = store.assets;
  commit({ ...store, assets: rest });
  void cloudDelete(id);
  return true;
}

// ─────────────────────────── Cloud mirror ─────────────────────────────
// Lazy-loaded so the Supabase client only ships in the bundle when
// the cloud-sync helpers are actually invoked (i.e. after a mutation).
// The helpers themselves no-op when cloud isn't configured or the
// user isn't signed in.

async function cloudUpsert(asset: Asset): Promise<void> {
  if (typeof window === "undefined") return;
  const { syncAssetUpsert } = await import("@/lib/cloud/asset-sync");
  await syncAssetUpsert(asset);
}

async function cloudDelete(id: string): Promise<void> {
  if (typeof window === "undefined") return;
  const { syncAssetDelete } = await import("@/lib/cloud/asset-sync");
  await syncAssetDelete(id);
}

export function getAsset(id: string): Asset | null {
  return getCached().assets[id] ?? null;
}

export function listAssets(): Asset[] {
  const store = getCached();
  return Object.values(store.assets).sort((a, b) => {
    // Pinned floats first, then newest first. Pinned-asc would feel
    // arbitrary so we sort by createdAt within a pin-bucket too.
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.createdAt - a.createdAt;
  });
}

// ─────────────────────────── React glue ───────────────────────────────
//
// Same pattern as `lib/studio/projects.ts` so the page can use
// `useSyncExternalStore` without bespoke hooks.

export function subscribeAssets(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Snapshot returns the same array reference until a mutation lands —
 *  required so React's bail-out comparison doesn't re-render on every
 *  unrelated state update. */
let snapshotCache: { store: StoreShape; list: Asset[] } | null = null;

export function getAssetsSnapshot(): Asset[] {
  const store = getCached();
  if (snapshotCache && snapshotCache.store === store) return snapshotCache.list;
  const list = listAssets();
  snapshotCache = { store, list };
  return list;
}

/** SSR snapshot — `null`-equivalent (empty array) so the page renders
 *  a skeleton on the server, then swaps to the real list once the client
 *  cache hydrates. Mirrors the project store's choice. */
const SERVER_SNAPSHOT: Asset[] = [];
export function getAssetsServerSnapshot(): Asset[] {
  return SERVER_SNAPSHOT;
}

// ─────────────────────────── Helpers ───────────────────────────────────

function cryptoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback for older runtimes (vitest jsdom on some Node versions
  // doesn't expose randomUUID).
  return `asset_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

// ─────────────────────────── Test-only reset ──────────────────────────
// Exposed so the unit tests can isolate each case without leaking state
// through the module-level cache.

export function __resetForTests(): void {
  cache = null;
  snapshotCache = null;
  listeners.clear();
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}
