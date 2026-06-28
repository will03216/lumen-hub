/**
 * Local store for BytePlus ModelArk asset groups.
 *
 * Groups are created server-side (CreateAssetGroup API) and their IDs
 * are persisted here in localStorage so the UI can list/browse them
 * without a server round-trip. Same useSyncExternalStore pattern as
 * lib/library/assets.ts.
 */

import { userKey } from '@/lib/storage-user';

const STORAGE_KEY = () => userKey("lumen.library.asset-groups.v1");

export type AssetGroup = {
  id: string;
  /** BytePlus GroupId returned by CreateAssetGroup */
  byteplusGroupId: string;
  name: string;
  description?: string;
  createdAt: number;
};

type StoreShape = {
  version: 1;
  groups: Record<string, AssetGroup>;
};

const EMPTY: StoreShape = { version: 1, groups: {} };

function readStore(): StoreShape {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(STORAGE_KEY());
    if (!raw) return { version: 1, groups: {} };
    const parsed = JSON.parse(raw) as StoreShape;
    if (parsed.version !== 1 || !parsed.groups) return EMPTY;
    return parsed;
  } catch {
    return EMPTY;
  }
}

function writeStore(s: StoreShape): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY(), JSON.stringify(s)); } catch { /* quota */ }
}

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

// ─────────────────────────── Public API ──────────────────────────────────

export function addAssetGroup(input: {
  byteplusGroupId: string;
  name: string;
  description?: string;
}): AssetGroup {
  const id = input.byteplusGroupId; // use BytePlus ID as local key too
  const group: AssetGroup = {
    id,
    byteplusGroupId: input.byteplusGroupId,
    name: input.name,
    description: input.description,
    createdAt: Date.now(),
  };
  const store = getCached();
  commit({ ...store, groups: { ...store.groups, [id]: group } });
  return group;
}

export function removeAssetGroup(id: string): void {
  const store = getCached();
  const { [id]: _, ...rest } = store.groups;
  commit({ ...store, groups: rest });
}

export function listAssetGroups(): AssetGroup[] {
  return Object.values(getCached().groups).sort((a, b) => b.createdAt - a.createdAt);
}

export function getAssetGroup(id: string): AssetGroup | null {
  return getCached().groups[id] ?? null;
}

// ─────────────────────────── React glue ──────────────────────────────────

export function subscribeAssetGroups(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let snapshotCache: { store: StoreShape; list: AssetGroup[] } | null = null;

export function getAssetGroupsSnapshot(): AssetGroup[] {
  const store = getCached();
  if (snapshotCache?.store === store) return snapshotCache.list;
  const list = listAssetGroups();
  snapshotCache = { store, list };
  return list;
}

const SERVER_SNAPSHOT: AssetGroup[] = [];
export function getAssetGroupsServerSnapshot(): AssetGroup[] {
  return SERVER_SNAPSHOT;
}
