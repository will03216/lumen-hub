'use client'

import { useEffect } from 'react'
import { useUser } from '@clerk/nextjs'
import { setStorageUser } from '@/lib/storage-user'

/**
 * Mounts at the root layout. Sets the runtime user ID used by
 * lib/storage-user.ts to scope localStorage keys per user.
 * Renders nothing — side-effect only.
 */
export function StorageUserInit() {
  const { user } = useUser()

  useEffect(() => {
    setStorageUser(user?.id ?? null)
    return () => setStorageUser(null)
  }, [user?.id])

  return null
}
