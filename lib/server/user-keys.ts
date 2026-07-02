import { auth } from '@clerk/nextjs/server'
import { decryptApiKey } from '@/lib/crypto'
import { MissingKeyError } from '@/lib/server/missing-key'

export { MissingKeyError }

export type UserKeys = {
  byteplus?: string
  byteplusAk?: string
  bytelusSk?: string
  byteplusTosBucket?: string
  /** AI MediaKit API Key — Bearer token for the enhance-video tool. Separate
   *  from the ark key and the AK/SK pair. */
  byteplusMediakitKey?: string
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
 * Strict BYOK: there is no env fallback. When a required key is absent the
 * adapter throws `MissingKeyError` and the route returns `missingKeyResponse`.
 */
export async function getUserKeys(): Promise<UserKeys> {
  if (!process.env.DATABASE_URL || !process.env.KEY_ENCRYPTION_SECRET) {
    return {}
  }

  const { userId } = await auth()
  if (!userId) return {}

  try {
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
          case 'byteplus':         keys.byteplus = plain;       break
          case 'byteplus_ak':      keys.byteplusAk = plain;     break
          case 'byteplus_sk':      keys.bytelusSk = plain;      break
          case 'byteplus_tos_bucket': keys.byteplusTosBucket = plain; break
          case 'byteplus_mediakit_key': keys.byteplusMediakitKey = plain; break
          case 'fal':              keys.fal = plain;             break
          case 'minimax':          keys.minimax = plain;         break
          case 'minimax_group_id': keys.minimaxGroupId = plain;  break
        }
      } catch {
        // Corrupted or mis-keyed row — skip silently, fall back to env var
      }
    }
    return keys
  } catch {
    return {}
  }
}

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

/**
 * If `err` is a MissingKeyError, return the 402 response for it; otherwise
 * return null so the caller can fall through to its generic error handling.
 */
export function keyErrorResponse(err: unknown): Response | null {
  if (err instanceof MissingKeyError) return missingKeyResponse(err.provider)
  return null
}
