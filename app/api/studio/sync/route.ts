/**
 * /api/studio/sync — cloud mirror for Studio canvas projects + folders.
 *
 * GET    → { projects: Project[], folders: Folder[] } for the signed-in user
 *          (hydration: lets a fresh device restore all canvas work).
 * POST   → upsert one record: body { kind: 'project'|'folder', record }
 * DELETE → remove one record:  body { kind: 'project'|'folder', id }
 *
 * Auth is enforced by Clerk and every query is scoped by user_id. DATABASE_URL
 * must be set for writes to land; if it isn't, the route returns 503 so the
 * client swallows the error gracefully (the local store stays authoritative).
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest } from 'next/server'
import type { Project, Folder } from '@/lib/studio/projects'

export const runtime = 'nodejs'

type Kind = 'project' | 'folder'
const isKind = (k: unknown): k is Kind => k === 'project' || k === 'folder'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: 'Cloud sync not configured' }, { status: 503 })
  }

  const { db } = await import('@/lib/db')
  const [projects, folders] = await Promise.all([
    db.query<{ payload: Project }>('SELECT payload FROM studio_projects WHERE user_id = $1', [userId]),
    db.query<{ payload: Folder }>('SELECT payload FROM studio_folders WHERE user_id = $1', [userId]),
  ])

  return Response.json({
    projects: projects.rows.map((r) => r.payload),
    folders: folders.rows.map((r) => r.payload),
  })
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: 'Cloud sync not configured' }, { status: 503 })
  }

  const { kind, record } = (await req.json()) as { kind?: unknown; record?: Project | Folder }
  if (!isKind(kind) || !record?.id) {
    return Response.json({ error: 'kind and record.id are required' }, { status: 400 })
  }

  const { db } = await import('@/lib/db')

  if (kind === 'project') {
    const p = record as Project
    // The DO UPDATE guard rejects out-of-order writes (older updatedAt) and
    // cross-user overwrites — so a stale autosave can't clobber newer work.
    await db.query(
      `INSERT INTO studio_projects (id, user_id, name, payload, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name, payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at
         WHERE studio_projects.user_id = EXCLUDED.user_id
           AND EXCLUDED.updated_at >= studio_projects.updated_at`,
      [p.id, userId, p.name, p, new Date(p.updatedAt).toISOString()],
    )
  } else {
    // Folders carry no updatedAt; they change rarely, so last-write-wins is fine.
    const f = record as Folder
    await db.query(
      `INSERT INTO studio_folders (id, user_id, payload, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (id) DO UPDATE
         SET payload = EXCLUDED.payload, updated_at = NOW()
         WHERE studio_folders.user_id = EXCLUDED.user_id`,
      [f.id, userId, f],
    )
  }

  return Response.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: 'Cloud sync not configured' }, { status: 503 })
  }

  const { kind, id } = (await req.json()) as { kind?: unknown; id?: string }
  if (!isKind(kind) || !id) {
    return Response.json({ error: 'kind and id are required' }, { status: 400 })
  }

  const { db } = await import('@/lib/db')
  const table = kind === 'project' ? 'studio_projects' : 'studio_folders'
  await db.query(`DELETE FROM ${table} WHERE id = $1 AND user_id = $2`, [id, userId])

  return Response.json({ ok: true })
}
