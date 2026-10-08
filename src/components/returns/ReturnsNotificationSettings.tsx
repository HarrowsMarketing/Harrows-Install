import { useEffect, useState } from 'react'
import axios from 'axios'
import { RETURN_EVENTS } from '../../lib/returns'
import { ModalFrame } from './fields'

interface Prefs {
  master: boolean
  canManageMaster: boolean
  email: string
  prefs: Record<string, boolean>
}

// Per-person email toggles for Returns events (all off until the person turns them on),
// plus the admin-only master switch that gates every Returns email for everyone.
export default function ReturnsNotificationSettings({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<Prefs | null>(null)
  const [saving, setSaving] = useState(false)
  const [masterSaving, setMasterSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    axios.get('/api/install/returns-notifications').then(r => setData(r.data)).catch(e => setError(e?.response?.data?.error || 'Could not load settings'))
  }, [])

  const toggleMaster = async (master: boolean) => {
    if (!data) return
    setData({ ...data, master })
    setMasterSaving(true)
    try { await axios.patch('/api/install/returns-notifications', { master }) }
    catch { setData(d => d ? { ...d, master: !master } : d) }
    finally { setMasterSaving(false) }
  }

  const save = async () => {
    if (!data) return
    setSaving(true); setError(''); setSaved(false)
    try {
      await axios.patch('/api/install/returns-notifications', { email: data.email, prefs: data.prefs })
      setSaved(true)
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to save')
    } finally { setSaving(false) }
  }

  const anyOn = data ? Object.values(data.prefs).some(Boolean) : false

  return (
    <ModalFrame title="Returns notifications" subtitle="Emails about returns — only the events you tick, only to you." onClose={onClose}
      footer={data && (
        <div>
          {error && <p className="text-sm text-red-500 mb-2">{error}</p>}
          {saved && !error && <p className="text-sm text-green-600 mb-2">Saved.</p>}
          <button onClick={save} disabled={saving} className="w-full py-2.5 text-sm font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save my notifications'}</button>
        </div>
      )}>
      {!data ? <p className="text-sm text-gray-400">{error || 'Loading…'}</p> : (
        <div className="space-y-5">
          {data.canManageMaster && (
            <div className={`border rounded-xl p-4 ${data.master ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
              <label className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">All Returns notifications</p>
                  <p className="text-xs text-gray-500">Master switch for everyone. Admins only. {data.master ? 'On — people get the events they have ticked.' : 'Off — nobody receives any Returns email, whatever they have ticked.'}</p>
                </div>
                <input type="checkbox" checked={data.master} disabled={masterSaving} onChange={e => toggleMaster(e.target.checked)} className="w-5 h-5 accent-green-600 shrink-0" />
              </label>
            </div>
          )}
          {!data.canManageMaster && !data.master && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Returns emails are currently switched off for everyone by the office. Your choices are saved and take effect once an admin turns them on.</p>
          )}

          <label className="block">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Send to</span>
            <input type="email" value={data.email} onChange={e => setData({ ...data, email: e.target.value })} placeholder="you@harrows.co.nz"
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            {anyOn && !data.email && <span className="text-xs text-red-500">An email address is needed for the ticked events.</span>}
          </label>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Email me when…</p>
            {RETURN_EVENTS.map(ev => (
              <label key={ev.key} className="flex items-start justify-between gap-3 py-2 border-b border-gray-100 last:border-0">
                <span>
                  <span className="text-sm text-gray-800">{ev.label}</span>
                  {ev.hint && <span className="block text-[11px] text-gray-400">{ev.hint}</span>}
                </span>
                <input type="checkbox" checked={!!data.prefs[ev.key]} onChange={e => setData({ ...data, prefs: { ...data.prefs, [ev.key]: e.target.checked } })} className="w-5 h-5 accent-harrows-yellow shrink-0 mt-0.5" />
              </label>
            ))}
            <p className="text-[11px] text-gray-400 mt-2">Each email shows the return number, job, priority, status, estimated arrival and a link straight to the return.</p>
          </div>
        </div>
      )}
    </ModalFrame>
  )
}
