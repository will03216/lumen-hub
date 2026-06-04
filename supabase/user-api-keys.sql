-- user_api_keys — per-user encrypted AI provider keys.
--
-- user_id is a Clerk user ID (text, e.g. "user_2abc...").
-- encrypted_key is AES-256-GCM ciphertext produced by lib/crypto.ts.
-- key_hint is the last 4 plaintext chars — shown in the UI so users
-- can confirm which key is saved without revealing the full value.
--
-- Run this against your BytePlus RDS (or Supabase) PostgreSQL instance.
-- For Supabase: paste into the SQL editor. For BytePlus RDS: psql or
-- any client connected to the DATABASE_URL.

CREATE TABLE IF NOT EXISTS user_api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT NOT NULL,
  provider     TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  key_hint     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_provider UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_id
  ON user_api_keys (user_id);
