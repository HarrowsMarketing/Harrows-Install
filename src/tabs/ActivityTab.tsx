import { useEffect, useState } from 'react'
import axios from 'axios'
import type { SigninLogEntry } from '../types'

export default function ActivityTab() {
  const [log, setLog] = useState<SigninLogEntry[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get('/api/install/signin-log').then(r => setLog(r.data.log)).finally(() => setLoading(false))
  }, [])

  const filtered = log.filter(l => l.installer_name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-1">Sign-in activity</h2>
      <p className="text-sm text-gray-500 mb-4">Every time someone has signed into the site reporting page with their PIN.</p>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by name..."
        className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm mb-4"
      />

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400">No sign-ins recorded yet.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
          {filtered.map(entry => (
            <div key={entry.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-harrows-yellow flex items-center justify-center text-xs font-bold text-gray-900">
                  {entry.installer_name[0]}
                </span>
                <span className="text-sm text-gray-800">{entry.installer_name}</span>
              </div>
              <span className="text-xs font-mono text-gray-400">
                {new Date(entry.signed_in_at).toLocaleString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
