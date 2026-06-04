'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

// Maps UI field IDs to the provider names the API expects
const FIELD_TO_PROVIDER = {
  byteplusApiKey: 'byteplus',
  falApiKey: 'fal',
  minimaxApiKey: 'minimax',
  minimaxGroupId: 'minimax_group_id',
} as const

type FieldId = keyof typeof FIELD_TO_PROVIDER
type Provider = (typeof FIELD_TO_PROVIDER)[FieldId]

const FIELDS: { id: FieldId; label: string; placeholder: string; hint?: string }[] = [
  { id: 'byteplusApiKey', label: 'BytePlus API Key', placeholder: 'bp-...', hint: 'console.byteplus.com → API Keys' },
  { id: 'falApiKey', label: 'fal.ai API Key', placeholder: 'key_id:key_secret', hint: 'fal.ai/dashboard/keys' },
  { id: 'minimaxApiKey', label: 'MiniMax API Key', placeholder: '...', hint: 'platform.minimax.io → API Keys' },
  { id: 'minimaxGroupId', label: 'MiniMax Group ID', placeholder: '...', hint: 'platform.minimax.io → Basic Information' },
]

type Hints = Partial<Record<Provider, string | null>>
type Toast = { type: 'success' | 'error'; message: string }

export default function SettingsPage() {
  const [values, setValues] = useState<Record<FieldId, string>>({
    byteplusApiKey: '', falApiKey: '', minimaxApiKey: '', minimaxGroupId: '',
  })
  const [hints, setHints] = useState<Hints>({})
  const [visible, setVisible] = useState<Record<FieldId, boolean>>({
    byteplusApiKey: false, falApiKey: false, minimaxApiKey: false, minimaxGroupId: false,
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<Provider | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)

  const showToast = (type: Toast['type'], message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3500)
  }

  const loadHints = useCallback(async () => {
    try {
      const res = await fetch('/api/user/keys')
      if (!res.ok) return
      const { keys } = (await res.json()) as { keys: Hints }
      setHints(keys)
    } catch {
      // non-critical — hints are display-only
    }
  }, [])

  useEffect(() => { loadHints() }, [loadHints])

  function toggleVisible(id: FieldId) {
    setVisible((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  async function handleSave() {
    const payload: Partial<Record<Provider, string>> = {}
    for (const field of FIELDS) {
      const val = values[field.id].trim()
      if (val) payload[FIELD_TO_PROVIDER[field.id]] = val
    }
    if (Object.keys(payload).length === 0) {
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
      // Clear inputs and reload hints
      setValues({ byteplusApiKey: '', falApiKey: '', minimaxApiKey: '', minimaxGroupId: '' })
      await loadHints()
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
      {/* Header */}
      <div className="border-b border-border px-6 py-4 flex items-center gap-4">
        <Link href="/" className="text-sm text-ink-dim hover:text-ink transition-colors">
          ← Back
        </Link>
        <span className="text-ink-dim">|</span>
        <span className="text-sm font-medium">Settings</span>
      </div>

      <div className="max-w-xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-semibold mb-1">API Keys</h1>
        <p className="text-sm text-ink-dim mb-8">
          Your keys are encrypted with AES-256-GCM before storage. They are never logged or shared.
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
                    onClick={() => toggleVisible(id)}
                    className="absolute right-3 text-zinc-500 hover:text-zinc-300 transition-colors text-xs select-none"
                    tabIndex={-1}
                  >
                    {visible[id] ? 'Hide' : 'Show'}
                  </button>
                </div>
                {hint && (
                  <p className="mt-1 text-[11px] text-zinc-600">{hint}</p>
                )}
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
          {saving ? 'Saving…' : 'Save Keys'}
        </button>

        {/* Toast */}
        {toast && (
          <div
            className={`mt-4 px-4 py-3 rounded-lg text-sm text-center transition-all ${
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
