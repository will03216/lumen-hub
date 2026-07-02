'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import Link from 'next/link'

const FIELD_TO_PROVIDER = {
  byteplusApiKey:     'byteplus',
  byteplusAk:         'byteplus_ak',
  bytelusSk:          'byteplus_sk',
  byteplusTosBucket:  'byteplus_tos_bucket',
  byteplusMediakitKey: 'byteplus_mediakit_key',
} as const

type FieldId = keyof typeof FIELD_TO_PROVIDER
type Provider = (typeof FIELD_TO_PROVIDER)[FieldId]

// Keys a user must have saved before the app unlocks (matches the server's
// REQUIRED_PROVIDERS in /api/user/keys and the proxy onboarding gate).
const REQUIRED_PROVIDERS: Provider[] = [
  'byteplus',
  'byteplus_ak',
  'byteplus_sk',
  'byteplus_tos_bucket',
]

const FIELDS: { id: FieldId; label: string; placeholder: string; hint: string }[] = [
  {
    id: 'byteplusApiKey',
    label: 'API Key',
    placeholder: 'bp-...',
    hint: 'console.byteplus.com/ark → API Keys',
  },
  {
    id: 'byteplusAk',
    label: 'Access Key',
    placeholder: 'AK...',
    hint: 'console.byteplus.com → IAM → Access Keys',
  },
  {
    id: 'bytelusSk',
    label: 'Secret Key',
    placeholder: 'SK...',
    hint: 'console.byteplus.com → IAM → Access Keys',
  },
  {
    id: 'byteplusTosBucket',
    label: 'TOS Bucket',
    placeholder: 'my-bucket',
    hint: 'console.byteplus.com → TOS → Buckets (public-read, your own bucket)',
  },
  {
    id: 'byteplusMediakitKey',
    label: 'AI MediaKit API Key (optional)',
    placeholder: 'mk-...',
    hint: 'console.byteplus.com → AI MediaKit → API Keys. Enables the Upscale & Enhance node.',
  },
]

type Hints = Partial<Record<Provider, string | null>>
type Toast = { type: 'success' | 'error'; message: string }

export default function SettingsPage() {
  // useSearchParams requires a Suspense boundary during prerender.
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <SettingsForm />
    </Suspense>
  )
}

function SettingsForm() {
  const router = useRouter()
  const { getToken } = useAuth()
  const searchParams = useSearchParams()
  const isSetup = searchParams.get('setup') === '1'

  const [values, setValues] = useState<Record<FieldId, string>>({
    byteplusApiKey: '', byteplusAk: '', bytelusSk: '', byteplusTosBucket: '', byteplusMediakitKey: '',
  })
  const [hints, setHints] = useState<Hints>({})
  const [visible, setVisible] = useState<Record<FieldId, boolean>>({
    byteplusApiKey: false, byteplusAk: false, bytelusSk: false, byteplusTosBucket: false, byteplusMediakitKey: false,
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<Provider | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)

  const showToast = (type: Toast['type'], message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3500)
  }

  const loadHints = useCallback(async (): Promise<Hints> => {
    try {
      const res = await fetch('/api/user/keys')
      if (!res.ok) return {}
      const { keys } = (await res.json()) as { keys: Hints }
      setHints(keys)
      return keys
    } catch {
      // non-critical
      return {}
    }
  }, [])

  useEffect(() => { loadHints() }, [loadHints])

  /**
   * Enter the app after onboarding. The `onboarded` flag was just written to
   * Clerk publicMetadata server-side, but the browser's session token still
   * carries the old claim — so a plain navigation gets bounced back here by
   * the proxy. Force a fresh token (skipCache) so it picks up onboarded:true,
   * then do a full navigation so the gate sees the updated cookie.
   */
  async function enterApp() {
    try { await getToken({ skipCache: true }) } catch { /* best-effort */ }
    window.location.assign('/')
  }

  async function handleSave() {
    const payload: Partial<Record<Provider, string>> = {}
    for (const field of FIELDS) {
      const val = values[field.id].trim()
      if (val) payload[FIELD_TO_PROVIDER[field.id]] = val
    }

    const allRequiredSaved = (h: Hints) => REQUIRED_PROVIDERS.every((p) => Boolean(h[p]))

    if (Object.keys(payload).length === 0) {
      // Nothing new typed. During setup, if everything required is already
      // stored, treat the button as "enter the app" instead of erroring.
      if (isSetup && allRequiredSaved(hints)) { await enterApp(); return }
      showToast('error', 'Enter at least one key to save.')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/user/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const { error } = await res.json()
        showToast('error', error ?? 'Failed to save keys.')
        return
      }
      setValues({ byteplusApiKey: '', byteplusAk: '', bytelusSk: '', byteplusTosBucket: '', byteplusMediakitKey: '' })
      const fresh = await loadHints()
      if (isSetup) {
        if (allRequiredSaved(fresh)) { await enterApp(); return }
        const missing = REQUIRED_PROVIDERS.filter((p) => !fresh[p]).length
        showToast('success', `Saved. Add the ${missing} remaining required key${missing > 1 ? 's' : ''} to continue.`)
        return
      }
      showToast('success', 'Keys saved.')
    } catch {
      showToast('error', 'Network error — please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: FieldId) {
    const provider = FIELD_TO_PROVIDER[id]
    setDeleting(provider)
    try {
      const res = await fetch('/api/user/keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      })
      if (!res.ok) {
        const { error } = await res.json()
        showToast('error', error ?? 'Failed to remove key.')
        return
      }
      await loadHints()
      showToast('success', 'Key removed.')
    } catch {
      showToast('error', 'Network error — please try again.')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border px-6 py-4 flex items-center gap-4">
        <Link href="/" className="text-sm text-ink-dim hover:text-ink transition-colors">
          ← Back
        </Link>
        <span className="text-ink-dim">|</span>
        <span className="text-sm font-medium">Settings</span>
      </div>

      <div className="max-w-xl mx-auto px-6 py-12">
        {isSetup && (
          <div className="mb-8 rounded-lg border border-blue-800 bg-blue-950/50 px-5 py-4">
            <p className="text-sm font-medium text-blue-300 mb-1">Welcome to Lumen Hub</p>
            <p className="text-sm text-blue-400/80">
              Add your BytePlus credentials to get started. You can find them at{' '}
              <a
                href="https://console.byteplus.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-blue-300"
              >
                console.byteplus.com
              </a>
              .
            </p>
          </div>
        )}

        <h1 className="text-2xl font-semibold mb-1">BytePlus Credentials</h1>
        <p className="text-sm text-ink-dim mb-8">
          Encrypted with AES-256-GCM before storage. Never logged or shared.
        </p>

        <div className="space-y-6">
          {FIELDS.map(({ id, label, placeholder, hint }) => {
            const provider = FIELD_TO_PROVIDER[id]
            const savedHint = hints[provider]
            const isDeleting = deleting === provider

            return (
              <div key={id}>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor={id} className="text-sm font-medium text-zinc-300">
                    {label}
                  </label>
                  {savedHint && (
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-zinc-500">
                        saved ···· {savedHint}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDelete(id)}
                        disabled={isDeleting}
                        className="text-[11px] text-red-500/70 hover:text-red-400 transition-colors disabled:opacity-40"
                      >
                        {isDeleting ? 'removing…' : 'remove'}
                      </button>
                    </div>
                  )}
                </div>
                <div className="relative flex items-center">
                  <input
                    id={id}
                    type={visible[id] ? 'text' : 'password'}
                    value={values[id]}
                    onChange={(e) => setValues((prev) => ({ ...prev, [id]: e.target.value }))}
                    placeholder={savedHint ? `Update (currently ···· ${savedHint})` : placeholder}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-500 pr-16"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() => setVisible((prev) => ({ ...prev, [id]: !prev[id] }))}
                    className="absolute right-3 text-zinc-500 hover:text-zinc-300 transition-colors text-xs select-none"
                    tabIndex={-1}
                  >
                    {visible[id] ? 'Hide' : 'Show'}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-zinc-600">{hint}</p>
              </div>
            )
          })}
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="mt-8 w-full bg-white text-black font-medium text-sm py-2.5 rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : isSetup ? 'Save & Enter App →' : 'Save Keys'}
        </button>

        {toast && (
          <div
            className={`mt-4 px-4 py-3 rounded-lg text-sm text-center ${
              toast.type === 'success'
                ? 'bg-green-950 text-green-400 border border-green-900'
                : 'bg-red-950 text-red-400 border border-red-900'
            }`}
          >
            {toast.message}
          </div>
        )}
      </div>
    </div>
  )
}
