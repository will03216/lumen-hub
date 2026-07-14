/**
 * /api/user/keys — CRUD for per-user encrypted API keys.
 *
 * GET    → returns key hints (last 4 chars) for each saved provider.
 *          Never returns the plaintext key.
 * POST   → upserts one or more provider keys (encrypted before write).
 * DELETE → removes a single provider key by name.
 */

import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextRequest } from 'next/server'
import { encryptApiKey } from '@/lib/crypto'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

const VALID_PROVIDERS = ['byteplus', 'byteplus_ak', 'byteplus_sk', 'byteplus_tos_bucket', 'byteplus_mediakit_key', 'fal', 'minimax', 'minimax_group_id', 'seed3d'] as const

/** Keys a user must have saved before they can use the app (strict BYOK). */
const REQUIRED_PROVIDERS = ['byteplus', 'byteplus_ak', 'byteplus_sk', 'byteplus_tos_bucket'] as const
type Provider = typeof VALID_PROVIDERS[number]

/**
 * Recompute whether the user has every required key saved and mirror it into
 * Clerk `publicMetadata.onboarded`, which the middleware reads (via the session
 * token) to gate access. Best-effort: a Clerk failure must not fail the request.
 */
async function syncOnboardedFlag(userId: string) {
  try {
    const result = await db.query<{ provider: string }>(
      'SELECT provider FROM user_api_keys WHERE user_id = $1',
      [userId],
    )
    const saved = new Set(result.rows.map(r => r.provider))
    const onboarded = REQUIRED_PROVIDERS.every(p => saved.has(p))
    const client = await clerkClient()
    await client.users.updateUserMetadata(userId, { publicMetadata: { onboarded } })
  } catch {
    // non-fatal — metadata will re-sync on the next save/delete
  }
}

// ── GET ─────────────────────────────────────────────────────────────────────

export async function GET() {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await db.query<{ provider: string; key_hint: string }>(
    'SELECT provider, key_hint FROM user_api_keys WHERE user_id = $1',
    [userId],
  )

  const hints: Record<string, string | null> = {}
  for (const p of VALID_PROVIDERS) hints[p] = null
  for (const row of result.rows) hints[row.provider] = row.key_hint

  return Response.json({ keys: hints })
}

// ── POST ─────────────────────────────────────────────────────────────────────

type PostBody = Partial<Record<Provider, string>>

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as PostBody

  const updates: { provider: Provider; value: string }[] = []
  for (const provider of VALID_PROVIDERS) {
    const value = body[provider]
    if (typeof value === 'string' && value.trim().length > 0) {
      updates.push({ provider, value: value.trim() })
    }
  }

  if (updates.length === 0) {
    return Response.json({ error: 'No valid keys provided' }, { status: 400 })
  }

  for (const { provider, value } of updates) {
    const encryptedKey = encryptApiKey(value)
    const keyHint = value.slice(-4)
    await db.query(
      `INSERT INTO user_api_keys (user_id, provider, encrypted_key, key_hint, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id, provider)
       DO UPDATE SET encrypted_key = EXCLUDED.encrypted_key,
                     key_hint      = EXCLUDED.key_hint,
                     updated_at    = NOW()`,
      [userId, provider, encryptedKey, keyHint],
    )
  }

  await syncOnboardedFlag(userId)

  return Response.json({ ok: true, updated: updates.map(u => u.provider) })
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { provider } = (await req.json()) as { provider?: string }
  if (!provider || !VALID_PROVIDERS.includes(provider as Provider)) {
    return Response.json({ error: 'Invalid provider' }, { status: 400 })
  }

  await db.query(
    'DELETE FROM user_api_keys WHERE user_id = $1 AND provider = $2',
    [userId, provider],
  )

  await syncOnboardedFlag(userId)

  return Response.json({ ok: true })
}
