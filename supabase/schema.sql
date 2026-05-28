-- Lumen Hub — cloud-sync schema (§55).
--
-- Run this once in your Supabase project's SQL editor. The app uses the
-- `anon` key + Supabase Auth to talk to these tables; row-level security
-- gates every read and write to the signed-in user.
--
-- Tables:
--   assets            — Library items (mirror of lib/library/assets.ts)
--   studio_projects   — Canvas projects (mirror of lib/studio/projects.ts)
--
-- Both tables store the full record under `payload` jsonb so adding new
-- fields in the app schema doesn't require an ALTER TABLE migration here.

-- ── Library assets ────────────────────────────────────────────────────────
create table if not exists public.assets (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  payload      jsonb not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists assets_user_id_updated_at_idx
  on public.assets (user_id, updated_at desc);

alter table public.assets enable row level security;

drop policy if exists "users see own assets" on public.assets;
create policy "users see own assets"
  on public.assets
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Studio projects ──────────────────────────────────────────────────────
create table if not exists public.studio_projects (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  payload      jsonb not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists studio_projects_user_id_updated_at_idx
  on public.studio_projects (user_id, updated_at desc);

alter table public.studio_projects enable row level security;

drop policy if exists "users see own studio projects" on public.studio_projects;
create policy "users see own studio projects"
  on public.studio_projects
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
