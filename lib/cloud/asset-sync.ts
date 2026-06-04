/**
 * Library cloud sync bridge.
 *
 * Fire-and-forget mirror of every Library mutation to /api/library/sync,
 * which persists to PostgreSQL (BytePlus RDS) using the Clerk session for
 * auth. Errors are swallowed — the local store is authoritative; cloud
 * is a write-through mirror for cross-device sync.
 */

import type { Asset } from "@/lib/library/assets";

export async function syncAssetUpsert(asset: Asset): Promise<void> {
  try {
    await fetch("/api/library/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset }),
    });
  } catch {
    // swallow — local write already succeeded
  }
}

export async function syncAssetDelete(assetId: string): Promise<void> {
  try {
    await fetch("/api/library/sync", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: assetId }),
    });
  } catch {
    // swallow — local write already succeeded
  }
}
