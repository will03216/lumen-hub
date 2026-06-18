/**
 * Studio cloud sync bridge.
 *
 * Fire-and-forget mirror of every Studio project/folder mutation to
 * /api/studio/sync, which persists to PostgreSQL (BytePlus RDS) using the
 * Clerk session for auth. Errors are swallowed — the local store is
 * authoritative; cloud is a write-through mirror plus a hydration source
 * for cross-device restore.
 *
 * Mirrors lib/cloud/asset-sync.ts (Library), adding the GET hydration read.
 */

import type { Project, Folder } from '@/lib/studio/projects'

async function upsert(kind: 'project' | 'folder', record: Project | Folder): Promise<void> {
  try {
    await fetch('/api/studio/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, record }),
    })
  } catch {
    // swallow — local write already succeeded
  }
}

async function remove(kind: 'project' | 'folder', id: string): Promise<void> {
  try {
    await fetch('/api/studio/sync', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, id }),
    })
  } catch {
    // swallow — local write already succeeded
  }
}

export const syncProjectUpsert = (p: Project) => upsert('project', p)
export const syncProjectDelete = (id: string) => remove('project', id)
export const syncFolderUpsert = (f: Folder) => upsert('folder', f)
export const syncFolderDelete = (id: string) => remove('folder', id)

/**
 * Pull the signed-in user's full Studio store from the server. Returns null
 * when sync isn't available (offline, not signed in, or 503/no DATABASE_URL)
 * so the caller keeps using the local store unchanged.
 */
export async function fetchCloudStudio(): Promise<{ projects: Project[]; folders: Folder[] } | null> {
  try {
    const res = await fetch('/api/studio/sync')
    if (!res.ok) return null
    return (await res.json()) as { projects: Project[]; folders: Folder[] }
  } catch {
    return null
  }
}
