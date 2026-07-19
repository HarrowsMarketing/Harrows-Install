import { useEffect, useState } from 'react'
import axios from 'axios'
import type { EodConfig, Installer } from '../types'

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const [config, setConfig] = useState<EodConfig | null>(null)
  const [people, setPeople] = useState<Installer[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    axios.get('/api/install/config').then(r => setConfig(r.data))
    axios.get('/api/install/people').then(r => setPeople(r.data.people))
  }, [])

  const save = async () => {
    if (!config) return
    setSaving(true)
    setError('')
    try {
      await axios.patch('/api/install/config', config)
      onClose()
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="text-base font-bold text-gray-900">Settings</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {!config ? (
          <p className="px-5 py-6 text-sm text-gray-400">Loading...</p>
        ) : (
          <div className="px-5 py-4 space-y-5">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Email</p>
              <label className="text-xs text-gray-400 mb-1 block">Internal CC address</label>
              <input value={config.internalCcAddress} onChange={e => setConfig({ ...config, internalCcAddress: e.target.value })}
                placeholder="Always CC this address on report emails"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3" />
              <label className="text-xs text-gray-400 mb-1 block">Email sign-off</label>
              <input value={config.emailSignoff} onChange={e => setConfig({ ...config, emailSignoff: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Defects, damages & reporting notice</p>
              <label className="text-xs text-gray-400 mb-1 block">Text shown under this header on every report</label>
              <textarea value={config.defectsNoticeText} onChange={e => setConfig({ ...config, defectsNoticeText: e.target.value })} rows={4}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">People presets</p>
              <label className="text-xs text-gray-400 mb-1 block">Default installer</label>
              <select value={config.defaultInstallerId || ''} onChange={e => setConfig({ ...config, defaultInstallerId: e.target.value || null })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">None</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Visible fields</p>
              {([
                ['products', 'Products field'],
                ['issues_solutions', 'Issues & Solutions fields'],
                ['photos', 'End of day photos'],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-gray-700">{label}</span>
                  <input type="checkbox" checked={config.visibleFields[key]}
                    onChange={e => setConfig({ ...config, visibleFields: { ...config.visibleFields, [key]: e.target.checked } })} />
                </label>
              ))}
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}
            <button onClick={save} disabled={saving} className="w-full py-3 text-sm font-semibold bg-gray-900 text-white rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : 'Save settings'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
