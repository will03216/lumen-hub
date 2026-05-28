"use client";

/**
 * ReferencePicker — §67 full-screen modal for browsing + selecting refs.
 *
 * Layout matches the Freepik pattern:
 *
 *  ┌───────────┬────────────────────────────────┬───────────┐
 *  │ sidebar   │ panel (history/style/character) │ right rail│
 *  │ (nav)     │   - tabs + grid                 │  selected │
 *  │           │   - empty-state for stubs       │  + upload │
 *  └───────────┴────────────────────────────────┴───────────┘
 *
 * - All panels read from the existing Library (`getAssetsSnapshot`)
 *   via `useSyncExternalStore`, so selecting a freshly-uploaded asset
 *   in another tab would reflect here too.
 * - Selection is immediate-mode: clicking a tile flips a ref in/out
 *   of the parent's `refs[]` via `onChange`. No "Done" button — the
 *   user closes the modal when they're satisfied.
 * - Upload is one-shot (data URL) for MVP — no server persistence yet,
 *   matching the old ReferenceImageInput's contract.
 */

import * as React from "react";
import {
  Camera,
  Clock,
  Image as ImageIcon,
  Layers,
  Palette,
  Pin,
  Sparkles,
  Sticker,
  Upload as UploadIcon,
  User,
  Wand2,
  X,
} from "lucide-react";
import type { RefImage } from "@/components/ui/reference-image-input";
import {
  getAssetsServerSnapshot,
  getAssetsSnapshot,
  subscribeAssets,
  type Asset,
} from "@/lib/library/assets";
import {
  isCharacterRef,
  isPromptStyleRef,
  isStyleRef,
} from "@/lib/library/refs-tags";
import { cn } from "@/lib/utils";
import { CreateStyle } from "./create-style";

// ─────────────────────────── Types ────────────────────────────────────

export type ReferencePickerTab =
  | "history"
  | "uploads"
  | "stock"
  | "style"
  | "character"
  | "element"
  | "color"
  | "effects"
  | "camera";

export type ReferencePickerProps = {
  open: boolean;
  initialTab: ReferencePickerTab;
  value: RefImage[];
  maxCount: number;
  onChange: (next: RefImage[]) => void;
  onClose: () => void;
};

// ─────────────────────────── Main component ───────────────────────────

export function ReferencePicker({
  open,
  initialTab,
  value,
  maxCount,
  onChange,
  onClose,
}: ReferencePickerProps) {
  // Hooks must run unconditionally — call them BEFORE the open-gate
  // early-return below. The picker is cheap when closed because we
  // still render `null`; the assets subscription is the same one the
  // CreationsFeed reads so React reuses the snapshot.
  const [tab, setTab] = React.useState<ReferencePickerTab>(initialTab);
  // §68 — Style panel can flip to a "Create Style" sub-view. Tracked
  // here rather than inside the Style panel because the back arrow on
  // the create form needs to flip it off and that signal naturally
  // lives at the picker level.
  const [creatingStyle, setCreatingStyle] = React.useState(false);
  const closeBtnRef = React.useRef<HTMLButtonElement>(null);
  const allAssets = React.useSyncExternalStore(
    subscribeAssets,
    getAssetsSnapshot,
    getAssetsServerSnapshot,
  );

  // Re-sync tab if the parent reopens with a different initialTab.
  // Also reset the "Create Style" sub-view whenever the modal opens
  // or the tab switches away from Style.
  React.useEffect(() => {
    if (open) {
      setTab(initialTab);
      setCreatingStyle(false);
    }
  }, [open, initialTab]);
  React.useEffect(() => {
    if (tab !== "style") setCreatingStyle(false);
  }, [tab]);

  // Esc-to-close + body scroll lock — only while open. Returns are wired
  // back on the same effect so unmount cleans up correctly.
  React.useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    // Focus the close button — gives screen readers a sane anchor and
    // makes Tab cycle stay inside the modal (close → tabbable contents).
    closeBtnRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6"
      role="dialog"
      aria-modal="true"
      aria-label="References picker"
      onClick={(e) => {
        // Close on backdrop click (but not when the click started on a child).
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative grid h-full max-h-[820px] w-full max-w-[1280px] grid-cols-[200px_1fr_280px] overflow-hidden rounded-[16px] border border-border bg-bg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button — top-right, floating so it never overlaps panel content. */}
        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          aria-label="Close references"
          className="absolute right-3 top-3 z-10 grid size-8 place-items-center rounded-full border border-border bg-bg-2 text-ink-dim hover:text-ink hover:border-ink cursor-pointer"
        >
          <X className="size-4" />
        </button>

        <PickerSidebar value={tab} onChange={setTab} />
        {creatingStyle ? (
          <CreateStyle
            onBack={() => setCreatingStyle(false)}
            onCreated={() => setCreatingStyle(false)}
          />
        ) : (
          <PickerPanel
            tab={tab}
            assets={allAssets}
            value={value}
            maxCount={maxCount}
            onChange={onChange}
            onNewStyle={() => setCreatingStyle(true)}
          />
        )}
        <PickerRightRail
          value={value}
          maxCount={maxCount}
          onChange={onChange}
        />
      </div>
    </div>
  );
}

// ─────────────────────────── Sidebar ─────────────────────────────────

type SidebarItem = {
  id: ReferencePickerTab;
  label: string;
  icon: React.ReactNode;
  /** Only the wired panels skip the "Coming soon" placeholder. */
  wired: boolean;
  /** Pinned items get a small pin glyph — purely cosmetic, matches the
   *  Freepik design that shows Style + Character as pinned defaults. */
  pinned?: boolean;
};

const SIDEBAR_TOP: SidebarItem[] = [
  { id: "history", label: "History", icon: <Clock className="size-3.5" />, wired: true },
  { id: "uploads", label: "Uploads", icon: <UploadIcon className="size-3.5" />, wired: false },
];

const SIDEBAR_REFS: SidebarItem[] = [
  { id: "stock",     label: "Stock",     icon: <ImageIcon className="size-3.5" />, wired: false },
  { id: "style",     label: "Style",     icon: <Sparkles className="size-3.5" />,   wired: true, pinned: true },
  { id: "character", label: "Character", icon: <User className="size-3.5" />,       wired: true, pinned: true },
  { id: "element",   label: "Element",   icon: <Sticker className="size-3.5" />,   wired: false },
  { id: "color",     label: "Color",     icon: <Palette className="size-3.5" />,   wired: false },
  { id: "effects",   label: "Effects",   icon: <Wand2 className="size-3.5" />,     wired: false },
  { id: "camera",    label: "Camera",    icon: <Camera className="size-3.5" />,    wired: false },
];

function PickerSidebar({
  value,
  onChange,
}: {
  value: ReferencePickerTab;
  onChange: (next: ReferencePickerTab) => void;
}) {
  return (
    <aside className="flex flex-col gap-1.5 overflow-y-auto border-r border-border bg-bg-2 p-3">
      <SidebarHeader>Creations</SidebarHeader>
      {/* Project switcher placeholder — Freepik has multi-project here,
          we just show a single fixed pill so the visual matches. */}
      <div className="flex items-center gap-2 rounded-[10px] border border-border bg-panel px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.10em] text-ink">
        <Layers className="size-3 text-accent" />
        Personal project
      </div>
      <div className="mt-1.5 flex flex-col gap-0.5">
        {SIDEBAR_TOP.map((item) => (
          <SidebarRow
            key={item.id}
            item={item}
            active={value === item.id}
            onClick={() => onChange(item.id)}
          />
        ))}
      </div>

      <SidebarHeader className="mt-4">All references</SidebarHeader>
      <div className="flex flex-col gap-0.5">
        {SIDEBAR_REFS.map((item) => (
          <SidebarRow
            key={item.id}
            item={item}
            active={value === item.id}
            onClick={() => onChange(item.id)}
          />
        ))}
      </div>
    </aside>
  );
}

function SidebarHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "px-2 pb-1 pt-2 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-mute",
        className,
      )}
    >
      {children}
    </div>
  );
}

function SidebarRow({
  item,
  active,
  onClick,
}: {
  item: SidebarItem;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 items-center justify-between gap-2 rounded-[8px] px-2 text-[12px] transition-colors cursor-pointer",
        active
          ? "bg-panel text-ink"
          : "text-ink-dim hover:bg-panel/60 hover:text-ink",
      )}
    >
      <span className="flex items-center gap-2">
        <span className={active ? "text-ink" : "text-ink-dim"}>{item.icon}</span>
        {item.label}
      </span>
      {item.pinned && (
        <Pin className="size-3 -rotate-45 text-ink-mute" aria-label="Pinned" />
      )}
    </button>
  );
}

// ─────────────────────────── Panel router ─────────────────────────────

function PickerPanel({
  tab,
  assets,
  value,
  maxCount,
  onChange,
  onNewStyle,
}: {
  tab: ReferencePickerTab;
  assets: readonly Asset[];
  value: RefImage[];
  maxCount: number;
  onChange: (next: RefImage[]) => void;
  /** Only consumed when tab === "style" — triggers the §68 create flow. */
  onNewStyle: () => void;
}) {
  if (tab === "history") {
    // Exclude ref:style / ref:character tagged assets so the three
    // panels stay disjoint — Style / Character own those, History
    // is for the rest.
    return (
      <PickerGrid
        title="History"
        searchPlaceholder="Search your creations"
        assets={assets.filter(
          (a) =>
            a.kind === "image" && !isStyleRef(a) && !isCharacterRef(a),
        )}
        emptyMessage="Nothing rendered yet — generate an image to populate History."
        value={value}
        maxCount={maxCount}
        onChange={onChange}
      />
    );
  }
  if (tab === "style") {
    return (
      <PickerGrid
        title="Styles"
        searchPlaceholder="Search for styles"
        assets={assets.filter(isStyleRef)}
        emptyMessage="No style references yet. Click + New style to create one from an image or a description."
        value={value}
        maxCount={maxCount}
        onChange={onChange}
        action={
          <button
            type="button"
            onClick={onNewStyle}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border bg-panel px-3 text-[12px] text-ink hover:border-ink cursor-pointer"
          >
            + New style
          </button>
        }
      />
    );
  }
  if (tab === "character") {
    return (
      <PickerGrid
        title="Characters"
        searchPlaceholder="Search for characters"
        assets={assets.filter(isCharacterRef)}
        emptyMessage="No character references yet. Upload a portrait on the right and we'll keep it here for re-use."
        value={value}
        maxCount={maxCount}
        onChange={onChange}
      />
    );
  }
  return <ComingSoonPanel tab={tab} />;
}

// ─────────────────────────── Grid panel ──────────────────────────────

type PickerGridProps = {
  title: string;
  searchPlaceholder: string;
  assets: readonly Asset[];
  emptyMessage: string;
  value: RefImage[];
  maxCount: number;
  onChange: (next: RefImage[]) => void;
  /** Optional right-aligned action in the title row (e.g. "+ New style"). */
  action?: React.ReactNode;
};

function PickerGrid({
  title,
  searchPlaceholder,
  assets,
  emptyMessage,
  value,
  maxCount,
  onChange,
  action,
}: PickerGridProps) {
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(() => {
    if (!query.trim()) return assets;
    const q = query.toLowerCase();
    return assets.filter((a) =>
      [a.prompt, a.title, ...a.tags].some(
        (s) => typeof s === "string" && s.toLowerCase().includes(q),
      ),
    );
  }, [assets, query]);

  // Dedup by assetId for Library-backed refs (the value field may turn
  // into a data URI mid-flight after a same-origin → base64 conversion,
  // so it's not stable; the asset id is).
  const selectedAssetIds = React.useMemo(
    () => new Set(value.map((r) => r.assetId).filter(Boolean)),
    [value],
  );

  async function toggle(asset: Asset) {
    if (selectedAssetIds.has(asset.id)) {
      onChange(value.filter((r) => r.assetId !== asset.id));
      return;
    }
    if (value.length >= maxCount) return;

    // §68 prompt-style refs — text-only, no URL bytes. Stuff the
    // description into `value` and tag the ref kind so the submit
    // path can append it to the prompt rather than image[].
    if (isPromptStyleRef(asset)) {
      onChange([
        ...value,
        {
          value: asset.prompt ?? "",
          kind: "prompt",
          label: asset.title ?? asset.id,
          assetId: asset.id,
        },
      ]);
      return;
    }

    // Image-shaped refs: pick the local mirror when present — it's
    // always valid, the remote `asset.url` may be a signed BytePlus URL
    // that's expired.
    const sourceUrl = asset.mirrorUrl ?? asset.url;
    let wireValue = sourceUrl;

    // BytePlus's server can't reach our localhost / Vercel paths, so a
    // same-origin URL has to be base64-encoded inline before we hand
    // it back as `image`. https:// URLs pass through verbatim — BytePlus
    // fetches them itself.
    const isSameOrigin =
      sourceUrl.startsWith("/") ||
      (typeof window !== "undefined" &&
        sourceUrl.startsWith(window.location.origin));
    if (isSameOrigin) {
      try {
        const res = await fetch(sourceUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        wireValue = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result ?? ""));
          r.onerror = () => reject(new Error("Failed to encode image"));
          r.readAsDataURL(blob);
        });
      } catch {
        // Network blip — pass the path anyway; render will surface the
        // BytePlus error if it can't fetch (same behaviour as before
        // this fix, so we're never worse off).
      }
    }

    onChange([
      ...value,
      {
        value: wireValue,
        kind: "url",
        label: asset.title ?? asset.prompt?.slice(0, 40) ?? asset.id,
        assetId: asset.id,
      },
    ]);
  }

  return (
    <section className="flex h-full flex-col overflow-hidden">
      {/* Search bar floats above the title block to match the screenshot's layout. */}
      <div className="border-b border-border p-4">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-10 w-full rounded-[10px] border border-border bg-panel px-3.5 text-[13px] text-ink placeholder:text-ink-mute focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-serif text-[24px] text-ink">{title}</h2>
          {action}
        </div>

        {filtered.length === 0 ? (
          <div className="grid h-full place-items-center text-center font-mono text-[11px] uppercase tracking-[0.10em] text-ink-dim">
            <p className="max-w-[360px] normal-case tracking-normal text-[13px] text-ink-dim">
              {emptyMessage}
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {filtered.map((asset) => {
              const active = selectedAssetIds.has(asset.id);
              const isPrompt = isPromptStyleRef(asset);
              const url = asset.mirrorUrl ?? asset.url;
              return (
                <li key={asset.id}>
                  <button
                    type="button"
                    onClick={() => toggle(asset)}
                    aria-pressed={active}
                    className={cn(
                      "group relative block aspect-square w-full overflow-hidden rounded-[12px] border bg-panel transition-all cursor-pointer hover:-translate-y-px",
                      active
                        ? "border-accent ring-2 ring-accent ring-offset-2 ring-offset-bg"
                        : "border-border hover:border-[var(--line-strong)]",
                    )}
                    title={asset.prompt ?? asset.id}
                  >
                    {isPrompt ? (
                      <span className="absolute inset-0 flex flex-col gap-1.5 bg-gradient-to-br from-[oklch(0.22_0.05_270)] to-[oklch(0.12_0.02_270)] p-3 text-left">
                        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                          T · prompt
                        </span>
                        <span className="font-serif text-[16px] leading-tight text-ink">
                          {asset.title ?? "#untitled"}
                        </span>
                        <span className="mt-auto line-clamp-3 text-[11px] leading-snug text-ink-dim">
                          {asset.prompt}
                        </span>
                      </span>
                    ) : (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={asset.title ?? asset.prompt ?? asset.id}
                          loading="lazy"
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                        {asset.title && (
                          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink/90">
                            {asset.title}
                          </span>
                        )}
                      </>
                    )}
                    {active && (
                      <span className="absolute right-2 top-2 grid size-5 place-items-center rounded-full bg-accent font-mono text-[10px] font-bold text-white">
                        ✓
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────── Coming-soon ─────────────────────────────

function ComingSoonPanel({ tab }: { tab: ReferencePickerTab }) {
  return (
    <section className="grid h-full place-items-center p-8 text-center">
      <div className="max-w-[360px]">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-mute">
          {tab}
        </p>
        <h2 className="mt-3 font-serif text-[28px] text-ink">Coming soon.</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-dim">
          This reference category isn't wired up yet. Use History, Style or
          Character on the left — those pull from your own library.
        </p>
      </div>
    </section>
  );
}

// ─────────────────────────── Right rail ──────────────────────────────

function PickerRightRail({
  value,
  maxCount,
  onChange,
}: {
  value: RefImage[];
  maxCount: number;
  onChange: (next: RefImage[]) => void;
}) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const remaining = maxCount - value.length;

  async function readFiles(files: FileList) {
    setErr(null);
    if (remaining <= 0) {
      setErr(`Max ${maxCount} references`);
      return;
    }
    const picked = Array.from(files).slice(0, remaining);
    const results: RefImage[] = [];
    for (const f of picked) {
      if (!f.type.startsWith("image/")) {
        setErr(`${f.name}: not an image`);
        continue;
      }
      if (f.size > 10 * 1024 * 1024) {
        setErr(`${f.name}: > 10 MB`);
        continue;
      }
      const dataUri = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(f);
      });
      results.push({ value: dataUri, kind: "file", label: f.name });
    }
    if (results.length) onChange([...value, ...results].slice(0, maxCount));
  }

  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  return (
    <aside className="flex flex-col gap-4 overflow-y-auto border-l border-border bg-bg-2 p-4">
      <div>
        <div className="mb-2 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">
          <span>Selected</span>
          <span>
            <span className={value.length > 0 ? "text-ink" : ""}>
              {value.length}
            </span>
            /{maxCount}
          </span>
        </div>
        {value.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-border p-4 text-center text-[12px] text-ink-mute">
            Click a thumbnail in the panel to add it here.
          </p>
        ) : (
          <ul className="grid grid-cols-3 gap-2">
            {value.map((ref, i) => (
              <li key={i} className="group relative aspect-square">
                <div className="h-full w-full overflow-hidden rounded-[8px] border border-border bg-panel">
                  {ref.kind === "prompt" ? (
                    <span
                      className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[oklch(0.22_0.05_270)] to-[oklch(0.12_0.02_270)] px-1.5 text-center font-serif text-[11px] leading-tight text-ink"
                      title={ref.value}
                    >
                      {ref.label ?? "#prompt"}
                    </span>
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={ref.value}
                      alt={ref.label ?? `ref ${i + 1}`}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label={`Remove ref ${i + 1}`}
                  className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border border-border bg-bg text-ink-dim hover:text-ink hover:border-ink cursor-pointer"
                >
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-[12px] border border-dashed border-border p-4 text-center">
        <p className="text-[13px] text-ink-dim">
          Drop an image or upload your own media
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void readFiles(e.target.files);
            e.target.value = ""; // re-pick same file
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={remaining <= 0}
          className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-[10px] border border-border bg-panel px-3 text-[12px] text-ink hover:border-ink disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <UploadIcon className="size-3.5" />
          Upload media
        </button>
        <button
          type="button"
          disabled
          title="Coming soon"
          className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-[10px] border border-border bg-panel px-3 text-[12px] text-ink-dim cursor-not-allowed"
        >
          <Camera className="size-3.5" />
          Take photo
        </button>
      </div>

      {err && (
        <div className="rounded-[8px] border border-[oklch(0.7_0.2_25)]/30 bg-[oklch(0.7_0.2_25)]/5 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.10em] text-[oklch(0.78_0.18_25)]">
          {err}
        </div>
      )}
    </aside>
  );
}
