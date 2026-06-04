import { auth } from '@clerk/nextjs/server'
import { decryptApiKey } from '@/lib/crypto'

export type UserKeys = {
  byteplus?: string
  fal?: string
  minimax?: string
  minimaxGroupId?: string
}

/**
 * Resolves the calling user's stored API keys from the DB.
 *
 * Returns an empty object when:
 *  - DATABASE_URL or KEY_ENCRYPTION_SECRET is not configured (local dev without DB)
 *  - The user has no keys saved yet
 *
 * The adapters (lib/byteplus.ts, lib/fal.ts, lib/minimax.ts) fall back
 * to their respective env vars when the returned value is undefined,
 * so existing behaviour is preserved when keys aren't set.
 */
export async function getUserKeys(): Promise<UserKeys> {
  if (!process.env.DATABASE_URL || !process.env.KEY_ENCRYPTION_SECRET) {
    return {}
  }

  const { userId } = await auth()
  if (!userId) return {}

  try {
    // Lazy import so the pg pool isn't created at module load time
    // (avoids errors during `next build` when DATABASE_URL may not be set).
    const { db } = await import('@/lib/db')
    const result = await db.query<{ provider: string; encrypted_key: string }>(
      'SELECT provider, encrypted_key FROM user_api_keys WHERE user_id = $1',
      [userId],
    )

    const keys: UserKeys = {}
    for (const row of result.rows) {
      try {
        const plain = decryptApiKey(row.encrypted_key)
        switch (row.provider) {
          case 'byteplus':       keys.byteplus = plain;        break
          case 'fal':            keys.fal = plain;             break
          case 'minimax':        keys.minimax = plain;         break
          case 'minimax_group_id': keys.minimaxGroupId = plain; break
        }
      } catch {
        // Corrupted or mis-keyed row — skip silently, fall back to env var
      }
    }
    return keys
  } catch {
    // DB unavailable — fall back to env vars gracefully
    return {}
  }
}

/**
 * Returns a 402 Response with a JSON body pointing users to /settings.
 * Used by routes when both the user key and env fallback are missing.
 */
export function missingKeyResponse(provider: string) {
  return Response.json(
    {
      error: 'missing_api_key',
      provider,
      message: `No ${provider} API key found. Add your key in Settings.`,
      settingsUrl: '/settings',
    },
    { status: 402 },
  )
}
