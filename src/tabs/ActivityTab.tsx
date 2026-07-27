import { useEffect, useState } from 'react'
import axios from 'axios'
import type { EodReport, JobCard } from '../types'

interface ActivityEntry {
  id: string
  kind: 'job_card' | 'report'
  title: string
  subtitle: string
  created_at: string
}

export default function ActivityTab() {
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      axios.get('/api/install/jobs'),
      axios.get('/api/install/reports'),
    ]).then(([jobsRes, reportsRes]) => {
      const jobEntries: ActivityEntry[] = (jobsRes.data.jobs as JobCard[]).map(j => ({
        id: `job-${j.id}`,
        kind: 'job_card',
        title: j.project_name,
        subtitle: `Job card created${j.created_by ? ` by ${j.created_by}` : ''} — Job ${j.job_number}`,
        created_at: j.created_at,
      }))
      const reportEntries: ActivityEntry[] = (reportsRes.data.reports as EodReport[]).map(r => ({
        id: `report-${r.id}`,
        kind: 'report',
        title: r.job?.project_name || 'Report',
        subtitle: `Report filed by ${r.installer?.name || 'Unknown'}`,
        created_at: r.created_at,
      }))
      const merged = [...jobEntries, ...reportEntries]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      setEntries(merged)
    }).finally(() => setLoading(false))
  }, [])

  const filtered = entries.filter(e =>
    e.title.toLowerCase().includes(search.toLowerCase()) || e.subtitle.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-1">Activity</h2>
      <p className="text-sm text-gray-500 mb-4">New job cards and end of day reports, most recent first.</p>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search..."
        className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm mb-4"
      />

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400">No activity recorded yet.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
          {filtered.map(entry => (
            <div key={entry.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${
                  entry.kind === 'job_card' ? 'bg-blue-50 text-blue-600' : 'bg-harrows-yellow/30 text-gray-900'
                }`}>
                  {entry.kind === 'job_card' ? 'JOB CARD' : 'REPORT'}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{entry.title}</p>
                  <p className="text-xs text-gray-400 truncate">{entry.subtitle}</p>
                </div>
              </div>
              <span className="text-xs font-mono text-gray-400 shrink-0">
                {new Date(entry.created_at).toLocaleString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
