import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import type { EodConfig, EodReport } from '../types'
import ReportDetailModal from '../components/ReportDetailModal'

// Same data as ReportLibraryTab (GET /api/install/reports, already ordered
// report_date desc), but grouped by day across every job instead of by job —
// for the "did everyone file today?" daily check rather than a job's history.
export default function DailyReportsTab() {
  const [reports, setReports] = useState<EodReport[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<EodReport | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [config, setConfig] = useState<Pick<EodConfig, 'defectsNoticeText' | 'emailSignoff' | 'internalCcAddress'>>({
    defectsNoticeText: '', emailSignoff: 'Harrows Install Team', internalCcAddress: '',
  })

  const load = async (q = '') => {
    setLoading(true)
    const r = await axios.get('/api/install/reports', { params: q ? { search: q } : {} })
    setReports(r.data.reports)
    setLoading(false)
  }

  useEffect(() => {
    load()
    axios.get('/api/install/config').then(r => setConfig(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    const t = setTimeout(() => load(search), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const grouped = useMemo(() => {
    const byDate = new Map<string, EodReport[]>()
    for (const r of reports) {
      if (!byDate.has(r.report_date)) byDate.set(r.report_date, [])
      byDate.get(r.report_date)!.push(r)
    }
    return Array.from(byDate.entries()) // already report_date desc from the API
  }, [reports])

  // Default to only the most recent day expanded — the daily-check use case cares
  // about today, not scrolling through every day's history. Runs once, the first
  // time reports actually arrive, so it doesn't re-collapse a day the user opened.
  const initialized = useRef(false)
  useEffect(() => {
    if (initialized.current || grouped.length === 0) return
    initialized.current = true
    setCollapsed(new Set(grouped.slice(1).map(([date]) => date)))
  }, [grouped])

  const toggle = (date: string) => setCollapsed(prev => {
    const next = new Set(prev)
    next.has(date) ? next.delete(date) : next.add(date)
    return next
  })

  const markEmailed = async (id: string) => {
    await axios.patch(`/api/install/reports/${id}/mark-emailed`)
    setSelected(null)
    load(search)
  }

  const deleteReport = async (id: string) => {
    if (!confirm('Delete this report? This cannot be undone.')) return
    await axios.delete(`/api/install/reports/${id}`)
    setSelected(null)
    load(search)
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-1">Daily reports</h2>
      <p className="text-sm text-gray-500 mb-4">Every install report, grouped by day across all jobs.</p>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by job number, project name or installer..."
        className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm mb-4"
      />

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : grouped.length === 0 ? (
        <p className="text-sm text-gray-400">No reports yet.</p>
      ) : (
        <div className="space-y-3">
          {grouped.map(([date, dateReports]) => {
            const isCollapsed = collapsed.has(date)
            const emailedCount = dateReports.filter(r => r.email_sent).length
            return (
              <div key={date} className="border border-gray-200 rounded-lg overflow-hidden">
                <button onClick={() => toggle(date)} className="w-full flex items-center justify-between px-4 py-3 bg-[#1E293B] text-white text-left">
                  <div className="flex items-center gap-2">
                    <svg className={`w-3.5 h-3.5 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    <span className="text-sm font-semibold">
                      {new Date(date + 'T00:00:00').toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                  </div>
                  <span className="text-xs text-gray-300">{dateReports.length} report{dateReports.length !== 1 ? 's' : ''} · {emailedCount} emailed</span>
                </button>
                {!isCollapsed && (
                  <div className="divide-y divide-gray-100">
                    {dateReports.map(r => (
                      <button key={r.id} onClick={() => setSelected(r)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600 shrink-0">
                            {r.installer?.name?.[0] || '?'}
                          </span>
                          <span className="text-sm text-gray-800 shrink-0">{r.installer?.name || 'Unknown'}</span>
                          <span className="text-xs font-mono font-bold bg-harrows-yellow text-gray-900 px-2 py-0.5 rounded shrink-0">JOB {r.job?.job_number || '—'}</span>
                          <span className="text-sm text-gray-500 truncate">{r.job?.project_name || 'Unassigned'}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden hidden sm:block">
                            <div className="h-full bg-harrows-yellow" style={{ width: `${r.percent_complete}%` }} />
                          </div>
                          <span className="text-xs text-gray-400 w-8">{r.percent_complete}%</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.email_sent ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                            {r.email_sent ? 'Emailed' : 'Email not sent'}
                          </span>
                          <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' })}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {selected && (
        <ReportDetailModal
          report={selected}
          config={config}
          onClose={() => setSelected(null)}
          onMarkEmailed={() => markEmailed(selected.id)}
          canDelete
          onDelete={() => deleteReport(selected.id)}
        />
      )}
    </div>
  )
}
