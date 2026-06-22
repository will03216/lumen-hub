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

-- ── Studio folders ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS studio_folders (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS studio_folders_user_id_updated_at_idx
  ON studio_folders (user_id, updated_at DESC);

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

-- ── Forge: productions ────────────────────────────────────────────────────
-- An instance of work under a Pipeline Template. `payload` holds the frozen
-- Production Spec (the IR) + lineage (template, spec_hash, gate approvals).
-- Durable, cross-device home for the agentic plan; the canvas it compiles to
-- lives in studio_projects.
CREATE TABLE IF NOT EXISTS productions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  template_id  TEXT NOT NULL,
  spec_hash    TEXT,
  -- linked Studio project the frozen spec compiled into (nullable until freeze)
  project_id   TEXT,
  payload      JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS productions_user_id_updated_at_idx
  ON productions (user_id, updated_at DESC);

-- ── Forge: production bibles ──────────────────────────────────────────────
-- Event-sourced continuity memory per production (characters, locations,
-- props, wardrobe, palette, LUT, seeds/refs per approved shot). Append-only;
-- the planner reads the derived current state to maintain cross-shot continuity.
CREATE TABLE IF NOT EXISTS production_bibles (
  production_id TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  template_id   TEXT NOT NULL,
  -- payload.events: append-only BibleEvent[]
  payload       JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS production_bibles_user_id_idx
  ON production_bibles (user_id);

-- ── Forge: QA traces (self-improvement / trace mining) ────────────────────
-- One row per guarded generation: the per-attempt critic scores + fix hints.
-- Source material for calibrating per-vertical critics and tuning prompting
-- over time (HLD §17). Best-effort telemetry; absence of DB is a no-op.
CREATE TABLE IF NOT EXISTS forge_qa_traces (
  id           BIGSERIAL PRIMARY KEY,
  user_id      TEXT NOT NULL,
  project_id   TEXT,
  template_id  TEXT,
  kind         TEXT,
  label        TEXT,
  attempts     INT NOT NULL,
  final_score  REAL,
  final_pass   BOOLEAN,
  payload      JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS forge_qa_traces_user_template_idx
  ON forge_qa_traces (user_id, template_id, created_at DESC);
