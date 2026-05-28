/**
 * Mirror — client trigger that asks the server to download a BytePlus
 * CDN asset to local cache, then patches the asset record with the
 * resulting `mirrorUrl`.
 *
 * Fired automatically by the auto-save helpers right after `addAsset`.
 * Best-effort: failures are non-blocking (the original URL still works
 * until it expires) and they leave the asset's `mirrorStatus` flipped to
 * "failed" so a future commit can offer a Retry chip in the detail
 * drawer.
 *
 * We deliberately don't await the mirror call from the auto-save call
 * site — it can take several seconds for a 30MB video, and blocking the
 * generator's success path would make every render feel slower for a
 * benefit the user doesn't see immediately. Fire-and-forget is fine
 * because addAsset already persisted the record; the mirror just
 * upgrades it in place.
 */

import { isByteplusHost } from "@/lib/media/byteplus-hosts";
import { getAsset, updateAsset, type Asset, type MirrorStatus } from "./assets";

export function shouldMirror(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return isByteplusHost(u.hostname);
  } catch {
    // data:, blob:, relative — never mirror.
    return false;
  }
}

// ─────────────────────────── Concurrency limiter ────────────────────
//
// A burst from sequential image-gen (N URLs in one go) or a batch
// render fires N mirror calls in parallel. Server-side each request
// streams an upstream file to disk; running 10+ in parallel contends
// for bandwidth and disk-write throughput, and any pre-streaming heap
// allocations stack up. Cap to a small number — 3 keeps the fastest
// download going while a couple sit queued.
const MAX_INFLIGHT = 3;
let inFlight = 0;
const queue: Array<() => void> = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_INFLIGHT) {
    await new Promise<void>((resolve) => queue.push(resolve));
  }
  inFlight++;
  try {
    return await fn();
  } finally {
    inFlight--;
    queue.shift()?.();
  }
}

/** Kick off a mirror for the given asset. Returns the patched asset
 *  on success, or `null` if mirroring was skipped (non-mirrorable URL)
 *  or failed. The store is updated as a side effect either way. */
export async function mirrorAsset(asset: Asset): Promise<Asset | null> {
  if (!shouldMirror(asset.url)) return null;
  if (asset.mirrorStatus === "mirrored") return asset;

  // Mark pending so the UI can surface a "syncing" badge later. The
  // patch is skip-when-unchanged inside `patchStatus` so retries for
  // an already-pending asset don't thrash the snapshot reference.
  patchStatus(asset.id, "pending");

  return withSlot(async () => {
    try {
      const res = await fetch("/api/library/mirror", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: asset.id,
          url: asset.url,
          kind: asset.kind,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        mirrorUrl?: string;
        error?: string;
      };
      if (!res.ok || !data.mirrorUrl) {
        patchStatus(asset.id, "failed");
        return null;
      }
      return updateAsset(asset.id, {
        mirrorUrl: data.mirrorUrl,
        mirrorStatus: "mirrored",
      });
    } catch {
      // Network error — leave the asset alive on the original URL.
      patchStatus(asset.id, "failed");
      return null;
    }
  });
}

/** Patch the status field, but only when it actually changes. Skipping
 *  same-status writes prevents a re-render fan-out across the Library
 *  grid every time a retry sets `pending → pending` or `failed →
 *  failed`. */
function patchStatus(id: string, status: MirrorStatus): void {
  const current = getAsset(id);
  if (current && current.mirrorStatus === status) return;
  updateAsset(id, { mirrorStatus: status });
}
