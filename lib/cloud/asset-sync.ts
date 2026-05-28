/**
 * Library cloud sync bridge.
 *
 * When the user is signed in, mirror every Library mutation up to a
 * Supabase `assets` table. Reads still come from the local store (it's
 * the authoritative session cache); the cloud path is a write-through
 * mirror so the same record exists on every device the user signs in
 * on. A separate hook (§55b) backfills cloud-only records on first
 * sign-in.
 *
 * SQL the operator runs in the Supabase project to enable this:
 *
 *     create table public.assets (
 *       id           text primary key,
 *       user_id      uuid not null references auth.users(id) on delete cascade,
 *       payload      jsonb not null,
 *       created_at   timestamptz not null default now(),
 *       updated_at   timestamptz not null default now()
 *     );
 *     create index assets_user_id_updated_at_idx on public.assets (user_id, updated_at desc);
 *     alter table public.assets enable row level security;
 *     create policy "users see own assets" on public.assets
 *       for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
 *
 * `payload` carries the full Asset record so schema additions in
 * `lib/library/assets.ts` don't require a migration here.
 */

import { getBrowserClient, isCloudConfigured } from "./supabase";
import type { Asset } from "@/lib/library/assets";

/** Async, fire-and-forget upsert of one asset record into Supabase.
 *  No-ops when cloud isn't configured or the user isn't signed in. */
export async function syncAssetUpsert(asset: Asset): Promise<void> {
  if (!isCloudConfigured()) return;
  const supabase = getBrowserClient();
  if (!supabase) return;

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return; // anonymous — local-only is the contract.

  // upsert by composite (user_id, id) so the same asset id can exist
  // for multiple users without colliding. Errors are swallowed —
  // local writes already succeeded; cloud-side drift can be repaired
  // by the next mutation or the §55b backfill pass.
  try {
    await supabase
      .from("assets")
      .upsert(
        {
          id: asset.id,
          user_id: userId,
          payload: asset,
          updated_at: new Date(asset.updatedAt).toISOString(),
        },
        { onConflict: "id" },
      );
  } catch {
    // swallow — see comment above
  }
}

/** Fire-and-forget delete. Called from the Library's "Delete" button. */
export async function syncAssetDelete(assetId: string): Promise<void> {
  if (!isCloudConfigured()) return;
  const supabase = getBrowserClient();
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return;
  try {
    await supabase
      .from("assets")
      .delete()
      .eq("user_id", userId)
      .eq("id", assetId);
  } catch {
    // swallow — see comment in syncAssetUpsert
  }
}
