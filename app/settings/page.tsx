'use client'

import { useState } from 'react'

type FieldId = 'byteplusApiKey' | 'falApiKey' | 'minimaxApiKey' | 'minimaxGroupId'

const FIELDS: { id: FieldId; label: string; placeholder: string }[] = [
  { id: 'byteplusApiKey', label: 'BytePlus API Key', placeholder: 'bp-...' },
  { id: 'falApiKey', label: 'fal.ai API Key', placeholder: '...' },
  { id: 'minimaxApiKey', label: 'MiniMax API Key', placeholder: '...' },
  { id: 'minimaxGroupId', label: 'MiniMax Group ID', placeholder: '...' },
]

export default function SettingsPage() {
  const [values, setValues] = useState<Record<FieldId, string>>({
    byteplusApiKey: '',
    falApiKey: '',
    minimaxApiKey: '',
    minimaxGroupId: '',
  })
  const [visible, setVisible] = useState<Record<FieldId, boolean>>({
    byteplusApiKey: false,
    falApiKey: false,
    minimaxApiKey: false,
    minimaxGroupId: false,
  })
  const [saving, setSaving] = useState(false)

  function toggleVisible(id: FieldId) {
    setVisible((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function handleChange(id: FieldId, value: string) {
    setValues((prev) => ({ ...prev, [id]: value }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      // TODO: wire to /api/settings in Block 3
      console.log('Save keys', values)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-semibold mb-1">API Keys</h1>
        <p className="text-sm text-zinc-400 mb-8">
          Your keys are encrypted and stored securely. They are never shared.
        </p>

        <div className="space-y-5">
          {FIELDS.map(({ id, label, placeholder }) => (
            <div key={id}>
              <label
                htmlFor={id}
                className="block text-sm font-medium text-zinc-300 mb-1.5"
              >
                {label}
              </label>
              <div className="relative flex items-center">
                <input
                  id={id}
                  type={visible[id] ? 'text' : 'password'}
                  value={values[id]}
                  onChange={(e) => handleChange(id, e.target.value)}
                  placeholder={placeholder}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-500 pr-10"
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
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="mt-8 w-full bg-white text-black font-medium text-sm py-2.5 rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save Keys'}
        </button>

        <p className="mt-6 text-xs text-zinc-600 text-center">
          Keys are stored encrypted with AES-256-GCM. They are used only to call AI providers on your behalf.
        </p>
      </div>
    </div>
  )
}
