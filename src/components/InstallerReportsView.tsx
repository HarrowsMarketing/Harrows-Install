import { useEffect, useState } from 'react'
import axios from 'axios'
import type { EodReport } from '../types'
import ReportDetailModal from './ReportDetailModal'

export default function InstallerReportsView({ refreshKey }: { refreshKey: number }) {
  const [reports, setReports] = useState<EodReport[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<EodReport | null>(null)

  const load = async () => {
    setLoading(true)
    const r = await axios.get('/api/install/reports')
    setReports(r.data.reports)
    setLoading(false)
  }

  useEffect(() => { load() }, [refreshKey])

  const markEmailed = async (id: string) => {
    await axios.patch(`/api/install/reports/${id}/mark-emailed`)
    setSelected(null)
    load()
  }

  return (
    <div>
      <h2 className="text-base font-bold text-gray-900 mb-3">My reports</h2>
      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-gray-400">You haven't filed any reports yet.</p>
      ) : (
        <div className="space-y-2">
          {reports.map(r => (
            <button key={r.id} onClick={() => setSelected(r)} className="w-full text-left bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-gray-300 transition-colors">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-900">{r.job?.project_name || 'No job selected'}</p>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.email_sent ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                  {r.email_sent ? 'Emailed' : 'Email not sent'}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">{r.report_date} · {r.percent_complete}% complete</p>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <ReportDetailModal
          report={selected}
          config={{ defectsNoticeText: '', emailSignoff: 'Harrows Install Team', internalCcAddress: '' }}
          onClose={() => setSelected(null)}
          onMarkEmailed={() => markEmailed(selected.id)}
        />
      )}
    </div>
  )
}
