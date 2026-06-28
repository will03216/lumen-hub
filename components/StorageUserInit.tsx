'use client'

import { useEffect } from 'react'
import { useUser } from '@clerk/nextjs'
import { setStorageUser } from '@/lib/storage-user'
import { hydrateFromCloud } from '@/lib/studio/projects'

/**
 * Mounts at the root layout. Sets the runtime user ID used by
 * lib/storage-user.ts to scope localStorage keys per user, then pulls the
 * user's Studio canvas work from the server so it restores on any device.
 * Renders nothing — side-effect only.
 */
export function StorageUserInit() {
  const { user } = useUser()

  useEffect(() => {
    setStorageUser(user?.id ?? null)
    // Hydrate cloud-backed stores once the user is known. Scoped storage must
    // be set first so the local merge target uses the right user's keys.
    if (user?.id) void hydrateFromCloud()
    return () => setStorageUser(null)
  }, [user?.id])

  return null
}
