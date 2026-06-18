-- studio_folders — per-user Studio folder records (cloud mirror of the
-- localStorage folders map). Run against existing databases that predate
-- server-side Studio persistence:
--   psql $DATABASE_URL -f supabase/studio-folders.sql
--
-- (studio_projects already exists in pg-schema.sql; only folders are new.)

CREATE TABLE IF NOT EXISTS studio_folders (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS studio_folders_user_id_updated_at_idx
  ON studio_folders (user_id, updated_at DESC);
