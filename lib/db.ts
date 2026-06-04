import { Pool } from 'pg'

declare global {
  // Persist pool across hot-reloads in dev
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined
}

function createPool(): Pool {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  return new Pool({ connectionString: url, max: 10, idleTimeoutMillis: 30_000 })
}

export const db: Pool = globalThis.__pgPool ?? (globalThis.__pgPool = createPool())
