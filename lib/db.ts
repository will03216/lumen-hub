import { Pool } from 'pg'

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined
}

function getPool(): Pool {
  if (!globalThis.__pgPool) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    // THE TIMEOUTS ARE NOT OPTIONAL — they are what makes a saturated pool
    // report itself instead of hanging.
    //
    // `pg` defaults connectionTimeoutMillis to 0, which means "wait forever
    // for a free client". With max: 10, an eleventh concurrent query blocks
    // indefinitely — no error, no rejection, nothing to log. Every API route
    // calls getUserKeys() before it logs anything, so a saturated pool took
    // the entire app down silently: requests arrived, parked, and the browser
    // gave up on its own deadline while the server had no record any of it
    // happened. A container restart "fixed" it by building a fresh pool,
    // which is what made it look intermittent.
    //
    // statement_timeout covers the other half: without it one stuck query
    // holds its connection for as long as the database will let it, and ten
    // of those exhaust the pool permanently. Every query here is a small key
    // lookup or upsert, so 30s is already far beyond normal.
    globalThis.__pgPool = new Pool({
      connectionString: url,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      statement_timeout: 30_000,
    })
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
