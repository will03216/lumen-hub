/**
 * Supabase clients — browser-side, with a feature-flag check.
 *
 * Cloud sync is opt-in. When `NEXT_PUBLIC_SUPABASE_URL` /
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY` are absent, every helper here returns
 * `null` and the rest of the app stays in local-first mode (Library /
 * Studio remain backed by localStorage exactly as before §55).
 *
 * Why a feature flag instead of always requiring config: the dev tier
 * works on a fresh clone without anyone having to provision a Supabase
 * project first. A team that wants cross-device sync flips the env
 * vars on; everyone else keeps single-device behaviour.
 *
 * Server-side clients (for Route Handlers / server components reading
 * the session cookie) land in a follow-up. The browser client covers
 * the auth UI + the cloud-sync bridge that mirror localStorage writes.
 */

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when both env vars are non-empty strings. Use this anywhere
 *  the UI needs to choose between "show sign-in affordances" and
 *  "stay quiet about cloud sync". */
export function isCloudConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/** Browser-side singleton. Returns `null` when env is missing so call
 *  sites can no-op cleanly instead of throwing. */
let browserSingleton: SupabaseClient | null = null;
export function getBrowserClient(): SupabaseClient | null {
  if (!isCloudConfigured()) return null;
  if (browserSingleton) return browserSingleton;
  browserSingleton = createBrowserClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
  return browserSingleton;
}
