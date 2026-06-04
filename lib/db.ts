import { Pool } from 'pg'

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined
}

function getPool(): Pool {
  if (!globalThis.__pgPool) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    globalThis.__pgPool = new Pool({ connectionString: url, max: 10, idleTimeoutMillis: 30_000 })
  }
  return globalThis.__pgPool
}

// Proxy defers pool creation until the first actual method call (e.g. db.query).
// This means importing lib/db at build time is safe even without DATABASE_URL set.
export const db = new Proxy({} as Pool, {
  get(_target, prop) {
    return Reflect.get(getPool(), prop)
  },
})
