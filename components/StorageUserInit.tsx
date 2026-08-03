'use client'

import { useEffect } from 'react'
import { useUser } from '@clerk/nextjs'
import { setStorageUser } from '@/lib/storage-user'
import { hydrateFromCloud, markCloudHydrated } from '@/lib/studio/projects'

/**
 * Mounts at the root layout. Sets the runtime user ID used by
 * lib/storage-user.ts to scope localStorage keys per user, then pulls the
 * user's Studio canvas work from the server so it restores on any device.
 * Renders nothing — side-effect only.
 */
export function StorageUserInit() {
  const { user, isLoaded } = useUser()

  useEffect(() => {
    // Only once Clerk has answered. Calling it earlier would publish "signed
    // out" as a resolved answer, and anything waiting for the scope would
    // render its empty state a beat before the real user arrives.
    if (!isLoaded) return
    setStorageUser(user?.id ?? null)
    // Hydrate cloud-backed stores once the user is known. Scoped storage must
    // be set first so the local merge target uses the right user's keys.
    if (user?.id) {
      void hydrateFromCloud()
    } else if (isLoaded) {
      // Clerk has answered and there is no user, so no pull will happen.
      // Say so, or anything waiting on hydration waits forever.
      markCloudHydrated()
    }
    // NOTE: no cleanup resetting the user to null. Doing so on every re-run
    // briefly un-scopes every localStorage key, and any read landing in that
    // window silently hits the wrong (unscoped) bucket.
  }, [user?.id, isLoaded])

  return null
}
