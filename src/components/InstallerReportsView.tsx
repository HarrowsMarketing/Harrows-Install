import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import type { EodReport, VisibleFields } from '../types'
import type { InstallerInfo } from '../utils/installerSession'
import ReportDetailModal from './ReportDetailModal'
import EditReportModal from './EditReportModal'

type View = 'date' | 'job'

interface Props {
  refreshKey: number
  installer: InstallerInfo
  visibleFields: VisibleFields
}

// Same by-date / by-job grouping as the admin ReportsTab (reports come pre-sorted
// report_date desc, created_at desc from the API) — so a follow-up report on a job an
// installer reported on weeks earlier stays easy to find alongside the original, not
// buried under everything filed since.
export default function InstallerReportsView({ refreshKey, installer, visibleFields }: Props) {
  const [reports, setReports] = useState<EodReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<EodReport | null>(null)
  const [editing, setEditing] = useState<EodReport | null>(null)
  const [view, setView] = useState<View>('date')
  const [collapsedJobs, setCollapsedJobs] = useState<Set<string>>(new Set())
  const [defectsNoticeText, setDefectsNoticeText] = useState('')

  useEffect(() => {
    axios.get('/api/install/report-form-config').then(r => setDefectsNoticeText(r.data.defectsNoticeText || '')).catch(() => {})
  }, [])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const r = await axios.get('/api/install/reports')
      setReports(r.data.reports)
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [refreshKey])

  const groupedByJob = useMemo(() => {
    const byJob = new Map<string, { job: EodReport['job']; jobId: string; reports: EodReport[] }>()
    for (const r of reports) {
      const key = r.job_id || 'unassigned'
      if (!byJob.has(key)) byJob.set(key, { job: r.job, jobId: key, reports: [] })
      byJob.get(key)!.reports.push(r)
    }
    return Array.from(byJob.values())
  }, [reports])

  // Only the most recently-touched job starts expanded — same "don't make me scroll
  // through everything" reasoning as ReportsTab's date view.
  const initialized = useRef(false)
  useEffect(() => {
    if (initialized.current || groupedByJob.length === 0) return
    initialized.current = true
    setCollapsedJobs(new Set(groupedByJob.slice(1).map(g => g.jobId)))
  }, [groupedByJob])

  const toggleJob = (jobId: string) => setCollapsedJobs(prev => {
    const next = new Set(prev)
    next.has(jobId) ? next.delete(jobId) : next.add(jobId)
    return next
  })

  const canEdit = (r: EodReport) => r.installer_id === installer.id

  const closeAndReload = () => { setEditing(null); load() }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-base font-bold text-gray-900">My reports</h2>
        {reports.length > 0 && (
          <div className="shrink-0 inline-flex border border-gray-200 rounded-lg p-0.5 bg-white">
            <button onClick={() => setView('date')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${view === 'date' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'}`}>
              By Date
            </button>
            <button onClick={() => setView('job')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${view === 'job' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'}`}>
              By Job
            </button>
          </div>
        )}
      </div>
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : error ? null : reports.length === 0 ? (
        <p className="text-sm text-gray-400">You haven't filed any reports yet.</p>
      ) : view === 'date' ? (
        <div className="space-y-2">
          {reports.map(r => <ReportCard key={r.id} r={r} onClick={() => setSelected(r)} showJob />)}
        </div>
      ) : (
        <div className="space-y-3">
          {groupedByJob.map(group => {
            const isCollapsed = collapsedJobs.has(group.jobId)
            return (
              <div key={group.jobId} className="border border-gray-200 rounded-lg overflow-hidden">
                <button onClick={() => toggleJob(group.jobId)} className="w-full flex items-center justify-between px-4 py-2.5 bg-[#1E293B] text-white text-left">
                  <div className="flex items-center gap-2 min-w-0">
                    <ChevronIcon collapsed={isCollapsed} />
                    <span className="text-xs font-mono font-bold bg-harrows-yellow text-gray-900 px-2 py-0.5 rounded shrink-0">JOB {group.job?.job_number || '—'}</span>
                    <span className="text-sm font-semibold truncate">{group.job?.project_name || 'Unassigned'}</span>
                  </div>
                  <span className="text-xs text-gray-300 shrink-0">{group.reports.length} report{group.reports.length !== 1 ? 's' : ''}</span>
                </button>
                {!isCollapsed && (
                  <div className="p-2 space-y-2 bg-gray-50">
                    {group.reports.map(r => <ReportCard key={r.id} r={r} onClick={() => setSelected(r)} />)}
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
          config={{ defectsNoticeText }}
          onClose={() => setSelected(null)}
          canSendToClient={false}
          canEdit={canEdit(selected)}
          onEdit={() => { setEditing(selected); setSelected(null) }}
        />
      )}

      {editing && (
        <EditReportModal
          report={editing}
          visibleFields={visibleFields}
          isAdmin={false}
          onClose={() => setEditing(null)}
          onSaved={closeAndReload}
        />
      )}
    </div>
  )
}

function ReportCard({ r, onClick, showJob }: { r: EodReport; onClick: () => void; showJob?: boolean }) {
  return (
    <button onClick={onClick} className="w-full text-left bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-gray-300 transition-colors">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-900">
          {showJob && r.job?.job_number && <span className="text-xs font-mono font-bold bg-harrows-yellow text-gray-900 px-1.5 py-0.5 rounded mr-2">JOB {r.job.job_number}</span>}
          {r.job?.project_name || 'No job selected'}
        </p>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${r.email_sent ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
          {r.email_sent ? 'Processed' : 'Not processed'}
        </span>
      </div>
      <p className="text-xs text-gray-400 mt-0.5">{r.report_date} · {r.percent_complete}% complete</p>
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
