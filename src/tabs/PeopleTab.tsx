import { useEffect, useState } from 'react'
import axios from 'axios'
import type { Installer } from '../types'

const emptyForm = { name: '', email: '', phone: '', pin: '', role: 'installer' as 'installer' | 'team_leader', adminAccess: false }

export default function PeopleTab() {
  const [people, setPeople] = useState<Installer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await axios.get('/api/install/people')
      setPeople(r.data.people)
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to load people')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const startEdit = (p: Installer) => {
    setEditingId(p.id)
    setForm({ name: p.name, email: p.email || '', phone: p.phone || '', pin: p.pin, role: p.role, adminAccess: p.admin_access })
    setShowAdd(true)
  }

  const startAdd = () => {
    setEditingId(null)
    setForm(emptyForm)
    setShowAdd(true)
  }

  const save = async () => {
    if (!form.name.trim() || !form.pin.trim()) return setError('Name and PIN are required')
    if (!/^\d{6}$/.test(form.pin)) return setError('PIN must be exactly 6 digits')
    setSaving(true)
    setError('')
    try {
      if (editingId) {
        await axios.patch(`/api/install/people/${editingId}`, {
          name: form.name, email: form.email, phone: form.phone, pin: form.pin, role: form.role, adminAccess: form.adminAccess,
        })
      } else {
        await axios.post('/api/install/people', {
          name: form.name, email: form.email, phone: form.phone, pin: form.pin, role: form.role, adminAccess: form.adminAccess,
        })
      }
      setShowAdd(false)
      setForm(emptyForm)
      setEditingId(null)
      load()
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to save person')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Remove this person?')) return
    await axios.delete(`/api/install/people/${id}`)
    setPeople(prev => prev.filter(p => p.id !== id))
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-1">People</h2>
      <p className="text-sm text-gray-500 mb-4">The installers who file end of day reports.</p>

      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : (
        <div className="space-y-2 mb-4">
          {people.map(p => (
            <button key={p.id} onClick={() => startEdit(p)} className="w-full text-left bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between hover:border-gray-300 transition-colors">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-gray-900">{p.name}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.role === 'team_leader' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
                  {p.role === 'team_leader' ? 'Team Leader' : 'Installer'}
                </span>
                {p.admin_access && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-900 text-white">ADMIN ACCESS</span>}
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">PIN: {p.pin}</span>
              </div>
              <span
                onClick={e => { e.stopPropagation(); remove(p.id) }}
                className="text-gray-300 hover:text-red-400 transition-colors shrink-0 ml-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </span>
            </button>
          ))}
        </div>
      )}

      {showAdd ? (
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Name"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="Email (optional)"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="Phone (optional)"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <input value={form.pin} onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 6) }))} placeholder="6-digit PIN" inputMode="numeric" maxLength={6}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" />
          <div className="flex gap-2">
            {(['installer', 'team_leader'] as const).map(r => (
              <button key={r} onClick={() => setForm(f => ({ ...f, role: r }))}
                className={`flex-1 text-xs py-2 rounded-lg font-medium transition-colors ${form.role === r ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>
                {r === 'installer' ? 'Installer' : 'Team Leader'}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={form.adminAccess} onChange={e => setForm(f => ({ ...f, adminAccess: e.target.checked }))} />
            Admin access (can sign into the office/admin shell)
          </label>
          <div className="flex gap-2 pt-1">
            <button onClick={() => { setShowAdd(false); setEditingId(null) }} className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
            <button onClick={save} disabled={saving} className="flex-1 px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : editingId ? 'Save changes' : 'Add person'}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={startAdd} className="px-4 py-2.5 text-sm font-semibold bg-harrows-yellow text-gray-900 rounded-lg hover:brightness-95 transition-all">
          + Add a person
        </button>
      )}
    </div>
  )
}
