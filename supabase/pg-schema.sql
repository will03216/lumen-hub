-- Lumen Hub — PostgreSQL schema for BytePlus RDS (or any Postgres).
--
-- No Supabase-specific extensions (auth.users FK, RLS policies).
-- user_id is a Clerk user ID (text, e.g. "user_2abc...").
--
-- Run once against your DATABASE_URL:
--   psql $DATABASE_URL -f supabase/pg-schema.sql

-- ── Library assets ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assets (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS assets_user_id_updated_at_idx
  ON assets (user_id, updated_at DESC);

-- ── Studio projects ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS studio_projects (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS studio_projects_user_id_updated_at_idx
  ON studio_projects (user_id, updated_at DESC);

-- ── User API keys ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  provider      TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  key_hint      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_provider UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_id
  ON user_api_keys (user_id);
