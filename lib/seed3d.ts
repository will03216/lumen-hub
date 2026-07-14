/**
 * Seed3D 2.0 — image-to-3D adapter (Doubao Seed3D on the China Ark region).
 *
 * A deliberately separate module from lib/byteplus.ts because Seed3D is a
 * *distinct provider*: its own credential (`seed3d`), its own endpoint
 * (`ark.cn-beijing.volces.com`, not the app's ap-southeast BytePlus host),
 * and its own model id. It happens to share BytePlus's async-task envelope
 * (POST → {id}; GET → {status, content}), so the shape below mirrors
 * `createVideoTask`/`getVideoTask`.
 *
 * Key resolution (the one env-fallback exception in this strict-BYOK app):
 *   1. the caller's per-user `seed3d` key (from getUserKeys), else
 *   2. process.env.SEED3D_API_KEY — for local dev only.
 * When neither is present we throw MissingKeyError('seed3d') so the route
 * returns the standard 402 → /settings response.
 */

import { MissingKeyError } from '@/lib/server/missing-key'

const DEFAULT_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'
const DEFAULT_MODEL = 'doubao-seed3d-2-0-260328'

export class Seed3DError extends Error {
  readonly status: number
  readonly statusText: string
  constructor(status: number, statusText: string, body: string) {
    super(`Seed3D ${status} ${statusText}: ${body.slice(0, 500)}`)
    this.name = 'Seed3DError'
    this.status = status
    this.statusText = statusText
  }
}

export type Seed3DFileFormat = 'glb' | 'obj'
export type Seed3DSubdivision = 'low' | 'medium' | 'high'

export type Seed3DParams = {
  /** Public https URL (or data URI) of the source image. */
  imageUrl: string
  fileformat?: Seed3DFileFormat
  subdivisionlevel?: Seed3DSubdivision
  model?: string
}

/** Terminal + in-flight states as returned by the task GET. */
export type Seed3DTask = {
  id: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  /** On success, `content.file_url` is a (24h-expiring) TOS zip URL that
   *  contains a single `.glb` mesh. */
  content?: { file_url?: string }
  error?: { message?: string }
}

function resolveKey(userKey: string | undefined): string {
  const key = userKey?.trim() || process.env.SEED3D_API_KEY?.trim()
  if (!key) throw new MissingKeyError('seed3d')
  return key
}

function baseUrl(): string {
  return process.env.SEED3D_BASE_URL?.trim() || DEFAULT_BASE_URL
}

function model(explicit?: string): string {
  return explicit || process.env.SEED3D_MODEL?.trim() || DEFAULT_MODEL
}

async function readError(res: Response): Promise<never> {
  const text = await res.text().catch(() => '')
  throw new Seed3DError(res.status, res.statusText, text)
}

/**
 * Submit an image→3D task. Returns the task id to poll.
 *
 * The Ark contract carries generation flags as a leading text block in the
 * `content` array (`--subdivisionlevel high --fileformat glb`), with the
 * image as a second `image_url` block — verified against the live API.
 */
export async function createModel3dTask(
  params: Seed3DParams,
  userKey: string | undefined,
): Promise<{ id: string }> {
  const key = resolveKey(userKey)
  if (!params.imageUrl) throw new Error('imageUrl is required')

  const flags = [
    `--subdivisionlevel ${params.subdivisionlevel ?? 'high'}`,
    `--fileformat ${params.fileformat ?? 'glb'}`,
  ].join(' ')

  const res = await fetch(`${baseUrl()}/contents/generations/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: model(params.model),
      content: [
        { type: 'text', text: ` ${flags}` },
        { type: 'image_url', image_url: { url: params.imageUrl } },
      ],
    }),
  })
  if (!res.ok) await readError(res)
  const json = (await res.json()) as { id?: string }
  if (!json.id) throw new Error('Seed3D create returned no task id')
  return { id: json.id }
}

/** Poll a task. Caller loops until status is terminal. */
export async function getModel3dTask(
  id: string,
  userKey: string | undefined,
): Promise<Seed3DTask> {
  const key = resolveKey(userKey)
  const res = await fetch(`${baseUrl()}/contents/generations/tasks/${id}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
  })
  if (!res.ok) await readError(res)
  return (await res.json()) as Seed3DTask
}
