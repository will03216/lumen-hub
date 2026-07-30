"use client";

/**
 * Library Groups panel — create/manage BytePlus ModelArk asset groups,
 * upload images into them, and register existing library assets.
 *
 * Layout:
 *   ┌─────────────────┬──────────────────────────────────────────┐
 *   │ Group list      │ Assets in selected group (from BytePlus) │
 *   │ + New group btn │ + Upload / Register buttons              │
 *   └─────────────────┴──────────────────────────────────────────┘
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type AssetGroup,
  addAssetGroup,
  addAssetGroups,
  getAssetGroupsServerSnapshot,
  getAssetGroupsSnapshot,
  subscribeAssetGroups,
  removeAssetGroup,
} from "@/lib/library/asset-groups";
import {
  type Asset,
  getAssetsServerSnapshot,
  getAssetsSnapshot,
  subscribeAssets,
  updateAsset,
} from "@/lib/library/assets";
import type { AssetInfo } from "@/lib/modelark";

// ─────────────────────────── Main component ──────────────────────────────

export function GroupsPanel() {
  const groups = useSyncExternalStore(
    subscribeAssetGroups,
    getAssetGroupsSnapshot,
    getAssetGroupsServerSnapshot,
  );
  const localAssets = useSyncExternalStore(
    subscribeAssets,
    getAssetsSnapshot,
    getAssetsServerSnapshot,
  );

  const router = useRouter();
  const searchParams = useSearchParams();

  // Persist the selected group in the URL (?groupId=...) so refresh keeps state.
  const selectedGroupId = searchParams.get("groupId");
  const setSelectedGroupId = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("kind", "groups");
      if (id) params.set("groupId", id);
      else params.delete("groupId");
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const [creating, setCreating] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  /** True while pages 2..n are still being backfilled behind the rendered list. */
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null;

  const filteredGroups = search.trim()
    ? groups.filter((g) =>
        g.name.toLowerCase().includes(search.toLowerCase()) ||
        g.description?.toLowerCase().includes(search.toLowerCase()),
      )
    : groups;

  // Sync BytePlus groups into localStorage on mount.
  //
  // The route serves one page at a time. We render page 1 as soon as it lands,
  // then backfill the remainder in the background — an account with thousands
  // of groups otherwise leaves the panel blank for the whole walk.
  useEffect(() => {
    const controller = new AbortController();

    type GroupsPage = {
      groups?: Array<{
        groupId: string;
        name: string;
        description?: string;
        createTime?: string;
      }>;
      total?: number;
      hasMore?: boolean;
    };

    async function fetchPage(page: number): Promise<GroupsPage | null> {
      const res = await fetch(`/api/modelark/groups?page=${page}`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        // Surface the failure instead of bailing silently — otherwise a
        // missing key or an upstream error is indistinguishable from an
        // account that genuinely has no groups.
        const detail = await res.json().catch(() => null) as { error?: string } | null;
        setSyncError(detail?.error ?? `Failed to load groups (HTTP ${res.status})`);
        return null;
      }
      return await res.json() as GroupsPage;
    }

    // One commit per page, never per group — commit() serialises the entire
    // store and re-renders, so per-group calls here were O(n²).
    function store(page: GroupsPage): number {
      const incoming = (page.groups ?? []).filter((g) => g.groupId);
      addAssetGroups(
        incoming.map((g) => ({
          byteplusGroupId: g.groupId,
          name: g.name,
          description: g.description,
          createTime: g.createTime,
        })),
      );
      return incoming.length;
    }

    async function syncGroups() {
      try {
        const first = await fetchPage(1);
        if (!first) return;
        const seen = store(first);
        setSyncing(!!first.hasMore);

        // Backfill pages 2..n. Sequential on purpose: this is a background
        // top-up behind an already-rendered list, and firing 50+ concurrent
        // signed requests at the upstream API risks rate limiting.
        let page = 2;
        let loaded = seen;
        const total = first.total ?? loaded;
        while (!controller.signal.aborted && loaded < total) {
          const next = await fetchPage(page);
          if (!next) break;
          const added = store(next);
          if (added === 0) break; // defensive: never spin on an empty page
          loaded += added;
          if (!next.hasMore) break;
          page++;
        }
      } catch (e) {
        // An abort is just unmount, not a failure worth showing.
        if (controller.signal.aborted) return;
        setSyncError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!controller.signal.aborted) setSyncing(false);
      }
    }

    void syncGroups();
    return () => controller.abort();
  }, []);

  // Auto-select first group when groups load and no URL param is present
  useEffect(() => {
    if (!selectedGroupId && groups.length > 0) {
      setSelectedGroupId(groups[0].id);
    }
  }, [groups, selectedGroupId, setSelectedGroupId]);

  return (
    <div className="flex h-[calc(100vh-22rem)] min-h-[480px] gap-5">
      {/* ── Left panel: group list ── */}
      <div className="flex w-56 shrink-0 flex-col">
        {/* Header */}
        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-dim">
            Groups
            {groups.length > 0 && (
              <span className="ml-1.5 text-ink-mute">({groups.length})</span>
            )}
            {/* The count climbs while the backfill runs — say so, so a partial
                list doesn't read as the complete one. */}
            {syncing && (
              <span className="ml-1.5 text-ink-mute" aria-live="polite">
                loading…
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-full border border-accent bg-accent-soft px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-accent hover:bg-accent hover:text-accent-ink"
          >
            + New
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search groups…"
            className="w-full rounded-[8px] border border-border bg-panel py-1 pl-7 pr-2 font-mono text-[11px] text-ink placeholder:text-ink-mute focus:border-accent focus:outline-none"
          />
          <svg className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-mute" width="11" height="11" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>

        {syncError && (
          <p className="mb-2 rounded-[6px] border border-[oklch(0.65_0.22_25)/30] bg-[oklch(0.65_0.22_25)/8] px-2 py-1 font-mono text-[9px] text-[oklch(0.78_0.20_25)]">
            Sync error: {syncError}
          </p>
        )}

        {creating && (
          <CreateGroupForm
            onDone={(id) => { setCreating(false); if (id) setSelectedGroupId(id); }}
          />
        )}

        {/* List */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {groups.length === 0 && !creating ? (
            <p className="rounded-[10px] border border-dashed border-border p-4 text-center font-mono text-[10px] text-ink-dim">
              No groups yet — create one to start registering assets with BytePlus.
            </p>
          ) : filteredGroups.length === 0 ? (
            <p className="py-4 text-center font-mono text-[10px] text-ink-mute">
              No groups match "{search}"
            </p>
          ) : (
            <ul className="space-y-0.5">
              {filteredGroups.map((g) => (
                <li key={g.id}>
                  <GroupRow
                    group={g}
                    active={g.id === selectedGroupId}
                    onClick={() => setSelectedGroupId(g.id)}
                    onDelete={() => {
                      removeAssetGroup(g.id);
                      if (selectedGroupId === g.id) setSelectedGroupId(null);
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Right panel: assets in selected group ── */}
      <div className="min-w-0 flex-1 overflow-y-auto">
        {selectedGroup ? (
          <GroupAssetsPanel
            group={selectedGroup}
            localAssets={localAssets}
          />
        ) : (
          <div className="flex h-48 items-center justify-center rounded-[12px] border border-dashed border-border text-[13px] text-ink-dim">
            Select a group to view its assets
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── Group row ───────────────────────────────────

function GroupRow({
  group,
  active,
  onClick,
  onDelete,
}: {
  group: AssetGroup;
  active: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className={`flex cursor-pointer items-center justify-between gap-2 rounded-[8px] px-3 py-2 transition-colors ${
        active ? "bg-accent/10 text-accent" : "text-ink-dim hover:bg-panel"
      }`}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span className="min-w-0 truncate font-mono text-[11px]">{group.name}</span>
      {hover && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="shrink-0 rounded px-1 py-0.5 text-[10px] text-ink-mute hover:text-[oklch(0.78_0.20_25)]"
          title="Remove group (local only — does not delete from BytePlus)"
        >
          ✕
        </button>
      )}
    </div>
  );
}

// ─────────────────────────── Create group form ───────────────────────────

function CreateGroupForm({ onDone }: { onDone: (id: string | null) => void }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/modelark/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: desc.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create group");
      // Save to client-side localStorage — must happen here, not in the API route,
      // because localStorage is only accessible in the browser.
      const saved = addAssetGroup({
        byteplusGroupId: data.byteplusGroupId,
        name: data.name,
        description: data.description,
      });
      onDone(saved.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="mb-3 rounded-[10px] border border-border bg-panel p-3 space-y-2">
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") void submit(); if (e.key === "Escape") onDone(null); }}
        placeholder="Group name"
        className="w-full rounded-[6px] border border-border bg-bg px-2 py-1 text-[12px] text-ink placeholder:text-ink-mute focus:border-accent focus:outline-none"
      />
      <input
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="Description (optional)"
        className="w-full rounded-[6px] border border-border bg-bg px-2 py-1 text-[12px] text-ink placeholder:text-ink-mute focus:border-accent focus:outline-none"
      />
      {error && <p className="text-[10px] text-[oklch(0.78_0.20_25)]">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !name.trim()}
          className="flex-1 rounded-[6px] border border-accent bg-accent px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-accent-ink disabled:opacity-40"
        >
          {busy ? "Creating…" : "Create"}
        </button>
        <button
          type="button"
          onClick={() => onDone(null)}
          className="rounded-[6px] border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────── Assets in a group ───────────────────────────

type RemoteAsset = AssetInfo & { registering?: boolean };

function GroupAssetsPanel({
  group,
  localAssets,
}: {
  group: AssetGroup;
  localAssets: Asset[];
}) {
  const [remoteAssets, setRemoteAssets] = useState<RemoteAsset[]>([]);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [showRegisterPicker, setShowRegisterPicker] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlAssetType, setUrlAssetType] = useState<"Image" | "Video">("Image");
  const [urlRegistering, setUrlRegistering] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const fetchRemote = useCallback(async () => {
    setLoadingRemote(true);
    setRemoteError(null);
    try {
      const res = await fetch(`/api/modelark/groups/${group.byteplusGroupId}/assets`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load assets");
      setRemoteAssets((data.assets as AssetInfo[]) ?? []);
    } catch (e) {
      setRemoteError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingRemote(false);
    }
  }, [group.byteplusGroupId]);

  useEffect(() => { void fetchRemote(); }, [fetchRemote]);

  // Upload a local file → fal.ai storage (public CDN) → BytePlus
  async function handleFileUpload(file: File) {
    setFileUploading(true);
    setAddError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("groupId", group.byteplusGroupId);
      const res = await fetch("/api/modelark/assets/upload", { method: "POST", body: form });
      const data = await res.json() as { assetId?: string; url?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      const assetId = data.assetId!;
      setRemoteAssets((prev) => [{ assetId, status: "Pending", url: data.url, registering: true }, ...prev]);
      void pollAsset(assetId);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e));
    } finally {
      setFileUploading(false);
    }
  }

  // Register a public URL entered by the user
  async function handleUrlSubmit() {
    const url = urlInput.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      setAddError("Must be an http:// or https:// URL — BytePlus needs to fetch it from the internet.");
      return;
    }
    setUrlRegistering(true);
    setAddError(null);
    try {
      await registerUrl(url, urlAssetType);
      setUrlInput("");
      setShowAddForm(false);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e));
    } finally {
      setUrlRegistering(false);
    }
  }

  // Register a URL with BytePlus, add to remote list, and start polling
  async function registerUrl(url: string, assetType = "Image"): Promise<string> {
    const res = await fetch("/api/modelark/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId: group.byteplusGroupId, url, assetType }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Registration failed");
    const assetId: string = data.assetId;
    setRemoteAssets((prev) => [{ assetId, status: "Pending", registering: true }, ...prev]);
    void pollAsset(assetId);
    return assetId;
  }

  async function pollAsset(assetId: string, localAssetId?: string) {
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const res = await fetch(`/api/modelark/assets/${assetId}`);
        const data = (await res.json()) as AssetInfo;
        setRemoteAssets((prev) =>
          prev.map((a) => (a.assetId === assetId ? { ...data, registering: false } : a)),
        );
        if (data.status === "Active") {
          // Stamp the byteplusAssetId onto the local library record so the
          // canvas Asset node can output it without re-picking.
          if (localAssetId) {
            updateAsset(localAssetId, {
              byteplusAssetId: assetId,
              byteplusStatus: "active",
            });
          }
          break;
        }
        if (data.status === "Failed") {
          if (localAssetId) updateAsset(localAssetId, { byteplusStatus: "failed" });
          break;
        }
      } catch { break; }
    }
  }

  // Register an existing local Library asset into this BytePlus group
  async function registerLocalAsset(asset: Asset) {
    const url = asset.mirrorUrl ?? asset.url;
    if (!url.startsWith("http") && !url.startsWith("/")) {
      alert("Asset has no accessible URL to register");
      return;
    }
    const absoluteUrl = url.startsWith("/")
      ? `${window.location.origin}${url}`
      : url;
    try {
      const res = await fetch("/api/modelark/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: group.byteplusGroupId,
          url: absoluteUrl,
          assetType: asset.kind === "video" ? "Video" : "Image",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Registration failed");
      const assetId: string = data.assetId;

      updateAsset(asset.id, {
        byteplusGroupId: group.byteplusGroupId,
        byteplusAssetId: assetId,
        byteplusStatus: "pending",
      });
      setRemoteAssets((prev) => [{ assetId, status: "Pending", registering: true }, ...prev]);
      setShowRegisterPicker(false);
      void pollAsset(assetId, asset.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  const unregistered = localAssets.filter(
    (a) =>
      (a.kind === "image" || a.kind === "reference" || a.kind === "video") &&
      a.byteplusGroupId !== group.byteplusGroupId,
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
          {group.name}
          {group.description && (
            <span className="ml-2 normal-case text-ink-mute">{group.description}</span>
          )}
        </span>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => void fetchRemote()}
            className="rounded-full border border-border px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.10em] text-ink-dim hover:border-ink-dim hover:text-ink"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => { setShowRegisterPicker((v) => !v); setShowAddForm(false); }}
            className="rounded-full border border-border px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.10em] text-ink-dim hover:border-ink-dim hover:text-ink"
          >
            Register existing
          </button>
          <button
            type="button"
            onClick={() => { setShowAddForm((v) => !v); setShowRegisterPicker(false); setAddError(null); }}
            className="rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.10em] text-accent hover:bg-accent hover:text-accent-ink"
          >
            + Add asset
          </button>
        </div>
      </div>

      {/* Add asset — file upload or public URL */}
      {showAddForm && (
        <div className="rounded-[10px] border border-border bg-panel p-3 space-y-3">
          {/* File upload row */}
          <div>
            <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dim">
              From your machine
            </p>
            <label className={`inline-flex cursor-pointer items-center gap-2 rounded-[6px] border border-border px-3 py-1.5 font-mono text-[10px] text-ink-dim transition-colors hover:border-ink-dim hover:text-ink ${fileUploading ? "opacity-50 cursor-not-allowed" : ""}`}>
              {fileUploading ? "Uploading…" : "Choose image or video file"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime,video/x-msvideo,video/*"
                className="sr-only"
                disabled={fileUploading || urlRegistering}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFileUpload(f);
                  e.target.value = "";
                }}
              />
            </label>
            <span className="ml-2 font-mono text-[9px] text-ink-mute">via BytePlus TOS (requires MODELARK_TOS_BUCKET)</span>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="font-mono text-[9px] text-ink-mute">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* URL input row */}
          <div>
            <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dim">
              From a public URL
            </p>
            <div className="flex gap-2">
              {/* Image / Video toggle */}
              <div className="flex overflow-hidden rounded-[6px] border border-border text-[10px] font-mono shrink-0">
                <button
                  type="button"
                  onClick={() => setUrlAssetType("Image")}
                  className={`px-2.5 py-1 transition-colors ${urlAssetType === "Image" ? "bg-accent text-accent-ink" : "bg-bg text-ink-dim hover:text-ink"}`}
                >
                  Image
                </button>
                <button
                  type="button"
                  onClick={() => setUrlAssetType("Video")}
                  className={`px-2.5 py-1 transition-colors ${urlAssetType === "Video" ? "bg-accent text-accent-ink" : "bg-bg text-ink-dim hover:text-ink"}`}
                >
                  Video
                </button>
              </div>
              <input
                autoFocus
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleUrlSubmit(); if (e.key === "Escape") setShowAddForm(false); }}
                placeholder={urlAssetType === "Video" ? "https://example.com/video.mp4" : "https://example.com/image.jpg"}
                className="min-w-0 flex-1 rounded-[6px] border border-border bg-bg px-2 py-1 text-[12px] text-ink placeholder:text-ink-mute focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void handleUrlSubmit()}
                disabled={urlRegistering || fileUploading || !urlInput.trim()}
                className="rounded-[6px] border border-accent bg-accent px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-accent-ink disabled:opacity-40"
              >
                {urlRegistering ? "Adding…" : "Add"}
              </button>
            </div>
          </div>

          {addError && <p className="text-[10px] text-[oklch(0.78_0.20_25)]">{addError}</p>}
        </div>
      )}

      {/* Register existing picker */}
      {showRegisterPicker && (
        <div className="rounded-[10px] border border-border bg-panel p-3">
          <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dim">
            Pick a library asset to register
          </p>
          {unregistered.length === 0 ? (
            <p className="text-[12px] text-ink-dim">All image and video assets are already registered in this group.</p>
          ) : (
            <ul className="grid max-h-48 grid-cols-5 gap-2 overflow-y-auto">
              {unregistered.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => void registerLocalAsset(a)}
                    className="group relative block aspect-square w-full overflow-hidden rounded-[6px] border border-border hover:border-accent"
                  >
                    {a.kind === "video" ? (
                      <video
                        src={a.mirrorUrl ?? a.url}
                        className="h-full w-full object-cover"
                        muted
                        playsInline
                        preload="metadata"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.mirrorUrl ?? a.url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    )}
                    {a.kind === "video" && (
                      <span className="absolute bottom-0.5 right-0.5 rounded-[3px] bg-black/60 px-1 font-mono text-[7px] text-white">
                        video
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Remote asset grid */}
      {loadingRemote ? (
        <p className="text-[13px] text-ink-dim">Loading assets…</p>
      ) : remoteError ? (
        <p className="text-[12px] text-[oklch(0.78_0.20_25)]">{remoteError}</p>
      ) : remoteAssets.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-[12px] border border-dashed border-border text-[13px] text-ink-dim">
          No assets in this group yet — upload an image or register one from your library.
        </div>
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {remoteAssets.map((a) => (
            <li key={a.assetId}>
              <RemoteAssetCard asset={a} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────── Remote asset card ───────────────────────────

function RemoteAssetCard({ asset }: { asset: RemoteAsset }) {
  const [copied, setCopied] = useState(false);

  const statusColor =
    asset.status === "Active"
      ? "bg-ok"
      : asset.status === "Failed"
      ? "bg-[oklch(0.65_0.22_25)]"
      : "bg-accent animate-pulse-soft";

  function copyId() {
    const text = asset.assetId;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text: string) {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="relative aspect-square overflow-hidden rounded-[8px] border border-border bg-panel">
        {asset.url && asset.assetType === "Video" ? (
          <video
            src={asset.url}
            className="h-full w-full object-cover"
            muted
            autoPlay
            loop
            playsInline
            preload="metadata"
            onError={(e) => { (e.currentTarget as HTMLVideoElement).style.display = "none"; }}
          />
        ) : asset.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/proxy-image?url=${encodeURIComponent(asset.url)}`}
            alt=""
            className="h-full w-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] text-ink-mute">
            {asset.registering ? "Registering…" : asset.status === "Pending" ? "Processing…" : "No preview"}
          </div>
        )}
        <span className={`absolute right-1.5 top-1.5 size-2 rounded-full ${statusColor}`} />
      </div>
      <div className="flex items-center justify-between gap-1">
        <span className="truncate font-mono text-[8px] text-ink-mute">{asset.assetId.slice(0, 12)}…</span>
        <span className={`font-mono text-[8px] ${asset.status === "Active" ? "text-ok" : asset.status === "Failed" ? "text-[oklch(0.78_0.20_25)]" : "text-ink-dim"}`}>
          {asset.status}
        </span>
      </div>
      <button
        type="button"
        onClick={copyId}
        className={`w-full rounded-[5px] border px-1 py-0.5 font-mono text-[8px] uppercase tracking-[0.08em] transition-colors ${copied ? "border-ok bg-ok/10 text-ok" : "border-border bg-panel text-ink-dim hover:border-accent hover:text-accent"}`}
        title={asset.assetId}
      >
        {copied ? "Copied!" : "Copy ID"}
      </button>
    </div>
  );
}
