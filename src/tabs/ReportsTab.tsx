import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import type { EodConfig, EodReport } from '../types'
import ReportDetailModal from '../components/ReportDetailModal'
import AddReportModal from '../components/AddReportModal'

type View = 'date' | 'job'

// Merged Daily Reports + Library — same data (GET /api/install/reports, already
// ordered report_date desc, created_at desc), just two different groupings of it:
// by day across every job (the "did everyone file today?" check) or by job card
// then by date (a job's full history). Toggle defaults to by-date.
export default function ReportsTab() {
  const [reports, setReports] = useState<EodReport[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<EodReport | null>(null)
  const [view, setView] = useState<View>('date')
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set())
  const [collapsedJobs, setCollapsedJobs] = useState<Set<string>>(new Set())
  const [showAdd, setShowAdd] = useState(false)
  const [config, setConfig] = useState<EodConfig>({
    defectsNoticeText: '',
    defaultInstallerId: null, visibleFields: { products: true, issues_solutions: true, photos: true },
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

  const groupedByDate = useMemo(() => {
    const byDate = new Map<string, EodReport[]>()
    for (const r of reports) {
      if (!byDate.has(r.report_date)) byDate.set(r.report_date, [])
      byDate.get(r.report_date)!.push(r)
    }
    return Array.from(byDate.entries()) // already report_date desc from the API
  }, [reports])

  const groupedByJob = useMemo(() => {
    const byJob = new Map<string, { job: EodReport['job']; jobId: string; reports: EodReport[] }>()
    for (const r of reports) {
      const key = r.job_id || 'unassigned'
      if (!byJob.has(key)) byJob.set(key, { job: r.job, jobId: key, reports: [] })
      byJob.get(key)!.reports.push(r)
    }
    return Array.from(byJob.values())
  }, [reports])

  // Default to only the most recent day expanded in the by-date view — the daily-check
  // use case cares about today, not scrolling through every day's history. Runs once,
  // the first time reports actually arrive, so it doesn't re-collapse a day the user opened.
  const initialized = useRef(false)
  useEffect(() => {
    if (initialized.current || groupedByDate.length === 0) return
    initialized.current = true
    setCollapsedDates(new Set(groupedByDate.slice(1).map(([date]) => date)))
  }, [groupedByDate])

  const toggleDate = (date: string) => setCollapsedDates(prev => {
    const next = new Set(prev)
    next.has(date) ? next.delete(date) : next.add(date)
    return next
  })

  const toggleJob = (jobId: string) => setCollapsedJobs(prev => {
    const next = new Set(prev)
    next.has(jobId) ? next.delete(jobId) : next.add(jobId)
    return next
  })

  const markProcessed = async (id: string) => {
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
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 className="text-lg font-bold text-gray-900">Reports</h2>
        <button onClick={() => setShowAdd(true)} className="shrink-0 px-4 py-2.5 text-sm font-semibold bg-harrows-yellow text-gray-900 rounded-lg hover:brightness-95 transition-all">
          + Add report
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-4">Every install report — group by date or by job card.</p>

      <div className="flex items-center gap-3 mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by job number, project name or installer..."
          className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 text-sm"
        />
        <div className="shrink-0 inline-flex border border-gray-200 rounded-lg p-0.5 bg-white">
          <button onClick={() => setView('date')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${view === 'date' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'}`}>
            By Date
          </button>
          <button onClick={() => setView('job')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${view === 'job' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'}`}>
            By Job Card
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-gray-400">No reports yet.</p>
      ) : view === 'date' ? (
        <div className="space-y-3">
          {groupedByDate.map(([date, dateReports]) => {
            const isCollapsed = collapsedDates.has(date)
            const emailedCount = dateReports.filter(r => r.email_sent).length
            return (
              <div key={date} className="border border-gray-200 rounded-lg overflow-hidden">
                <button onClick={() => toggleDate(date)} className="w-full flex items-center justify-between px-4 py-3 bg-[#1E293B] text-white text-left">
                  <div className="flex items-center gap-2">
                    <ChevronIcon collapsed={isCollapsed} />
                    <span className="text-sm font-semibold">
                      {new Date(date + 'T00:00:00').toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                  </div>
                  <span className="text-xs text-gray-300">{dateReports.length} report{dateReports.length !== 1 ? 's' : ''} · {emailedCount} processed</span>
                </button>
                {!isCollapsed && (
                  <div className="divide-y divide-gray-100">
                    {dateReports.map(r => <ReportRow key={r.id} r={r} onClick={() => setSelected(r)} showJob />)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {groupedByJob.map(group => {
            const isCollapsed = collapsedJobs.has(group.jobId)
            const emailedCount = group.reports.filter(r => r.email_sent).length
            const byDate = new Map<string, EodReport[]>()
            for (const r of group.reports) {
              if (!byDate.has(r.report_date)) byDate.set(r.report_date, [])
              byDate.get(r.report_date)!.push(r)
            }
            return (
              <div key={group.jobId} className="border border-gray-200 rounded-lg overflow-hidden">
                <button onClick={() => toggleJob(group.jobId)} className="w-full flex items-center justify-between px-4 py-3 bg-[#1E293B] text-white text-left">
                  <div className="flex items-center gap-2">
                    <ChevronIcon collapsed={isCollapsed} />
                    <span className="text-xs font-mono font-bold bg-harrows-yellow text-gray-900 px-2 py-0.5 rounded">JOB {group.job?.job_number || '—'}</span>
                    <span className="text-sm font-semibold">{group.job?.project_name || 'Unassigned'}</span>
                  </div>
                  <span className="text-xs text-gray-300">{group.reports.length} reports · {emailedCount} processed</span>
                </button>
                {!isCollapsed && (
                  <div className="divide-y divide-gray-100">
                    {Array.from(byDate.entries()).map(([date, dateReports]) => (
                      <div key={date}>
                        <div className="px-4 py-2 bg-gray-50 flex items-center justify-between text-xs">
                          <span className="font-medium text-gray-600">{new Date(date + 'T00:00:00').toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                          <span className="text-gray-400">{dateReports.length} report{dateReports.length !== 1 ? 's' : ''} · {dateReports.map(r => r.installer?.name).filter(Boolean).join(', ')}</span>
                        </div>
                        {dateReports.map(r => <ReportRow key={r.id} r={r} onClick={() => setSelected(r)} />)}
                      </div>
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
          onMarkProcessed={() => markProcessed(selected.id)}
          canDelete
          onDelete={() => deleteReport(selected.id)}
        />
      )}

      {showAdd && (
        <AddReportModal
          visibleFields={config.visibleFields}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load(search) }}
        />
      )}
    </div>
  )
}

function ReportRow({ r, onClick, showJob }: { r: EodReport; onClick: () => void; showJob?: boolean }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600 shrink-0">
          {r.installer?.name?.[0] || '?'}
        </span>
        <span className="text-sm text-gray-800 shrink-0">{r.installer?.name || 'Unknown'}</span>
        {showJob && (
          <>
            <span className="text-xs font-mono font-bold bg-harrows-yellow text-gray-900 px-2 py-0.5 rounded shrink-0">JOB {r.job?.job_number || '—'}</span>
            <span className="text-sm text-gray-500 truncate">{r.job?.project_name || 'Unassigned'}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden hidden sm:block">
          <div className="h-full bg-harrows-yellow" style={{ width: `${r.percent_complete}%` }} />
        </div>
        <span className="text-xs text-gray-400 w-8">{r.percent_complete}%</span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.email_sent ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
          {r.email_sent ? 'Processed' : 'Not processed'}
        </span>
        <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' })}</span>
      </div>
    </button>
  )
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg className={`w-3.5 h-3.5 transition-transform ${collapsed ? '-rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  )
}
