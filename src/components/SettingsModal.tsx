import { useEffect, useState } from 'react'
import axios from 'axios'
import type { EodConfig, Installer } from '../types'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const [config, setConfig] = useState<EodConfig | null>(null)
  const [people, setPeople] = useState<Installer[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [newRecipientName, setNewRecipientName] = useState('')
  const [newRecipientEmail, setNewRecipientEmail] = useState('')
  const [myNotify, setMyNotify] = useState(false)
  const [myNotifySaving, setMyNotifySaving] = useState(false)

  useEffect(() => {
    axios.get('/api/install/config').then(r => setConfig(r.data))
    axios.get('/api/install/people').then(r => setPeople(r.data.people))
    axios.get('/api/install/my-notification-pref').then(r => setMyNotify(r.data.enabled))
  }, [])

  // Saved immediately on toggle rather than bundled with the big "Save settings" button
  // below — it's a personal preference, not part of the shared config every admin edits.
  const toggleMyNotify = async (enabled: boolean) => {
    setMyNotify(enabled)
    setMyNotifySaving(true)
    try {
      await axios.patch('/api/install/my-notification-pref', { enabled })
    } catch {
      setMyNotify(!enabled)
    } finally {
      setMyNotifySaving(false)
    }
  }

  const addRecipient = () => {
    if (!config) return
    const name = newRecipientName.trim()
    const email = newRecipientEmail.trim()
    if (!name || !EMAIL_RE.test(email)) return setError('Enter a name and a valid email to add a recipient')
    setError('')
    setConfig({ ...config, notificationRecipients: [...config.notificationRecipients, { name, email }] })
    setNewRecipientName('')
    setNewRecipientEmail('')
  }

  const removeRecipient = (i: number) => {
    if (!config) return
    setConfig({ ...config, notificationRecipients: config.notificationRecipients.filter((_, idx) => idx !== i) })
  }

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
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">My notifications</p>
              <label className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Email me when a report is submitted</span>
                <input type="checkbox" checked={myNotify} disabled={myNotifySaving} onChange={e => toggleMyNotify(e.target.checked)} />
              </label>
              <p className="text-xs text-gray-400 mt-1">Off by default — this only applies to you, not other admins.</p>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Defects, damages & reporting notice</p>
              <label className="text-xs text-gray-400 mb-1 block">Text shown at the bottom of every job report PDF</label>
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

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Notifications</p>
              <label className="text-xs text-gray-400 mb-2 block">People emailed immediately after every report is submitted — not every admin or installer, only who's listed here.</label>
              {config.notificationRecipients.length > 0 && (
                <div className="space-y-1.5 mb-2">
                  {config.notificationRecipients.map((r, i) => (
                    <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                      <div>
                        <p className="text-sm text-gray-800">{r.name}</p>
                        <p className="text-xs text-gray-400">{r.email}</p>
                      </div>
                      <button type="button" onClick={() => removeRecipient(i)} className="text-gray-400 hover:text-red-500 text-sm">&times;</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input value={newRecipientName} onChange={e => setNewRecipientName(e.target.value)} placeholder="Name"
                  className="w-1/3 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                <input value={newRecipientEmail} onChange={e => setNewRecipientEmail(e.target.value)} placeholder="Email"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                <button type="button" onClick={addRecipient} className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shrink-0">
                  Add
                </button>
              </div>
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
