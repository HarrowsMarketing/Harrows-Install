import { useEffect, useState } from 'react'
import axios from 'axios'
import type { EodConfig, EodReport } from '../types'
import { openReportEmailDraft } from '../utils/emailDraft'
import { generateReportPDF } from '../utils/generateReportPDF'

interface Props {
  report: EodReport
  config: Pick<EodConfig, 'defectsNoticeText' | 'emailSignoff' | 'internalCcAddress'>
  onClose: () => void
  onMarkEmailed: () => void
  canDelete?: boolean
  onDelete?: () => void
}

export default function ReportDetailModal({ report, config, onClose, onMarkEmailed, canDelete, onDelete }: Props) {
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [generatingPdf, setGeneratingPdf] = useState(false)

  useEffect(() => {
    report.photos?.forEach(p => {
      axios.get('/api/install/photos/url', { params: { pathname: p.blob_pathname } })
        .then(r => setPhotoUrls(prev => ({ ...prev, [p.id]: r.data.url })))
        .catch(() => {})
    })
  }, [report])

  const draftEmail = () => {
    openReportEmailDraft(report, config)
  }

  const printPdf = async () => {
    setGeneratingPdf(true)
    try { await generateReportPDF(report) } finally { setGeneratingPdf(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <div>
            <p className="text-sm font-bold text-gray-900">{report.job?.project_name || 'Job'}</p>
            <p className="text-xs text-gray-400">Job {report.job?.job_number || '—'} · {report.report_date}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">Installer: <span className="font-medium text-gray-800">{report.installer?.name || '—'}</span></span>
            <span className="text-xs text-gray-500">{report.percent_complete}% complete</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${report.email_sent ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
              {report.email_sent ? 'Emailed' : 'Email not sent'}
            </span>
          </div>

          <Field label="Work completed today" value={report.work_done} />
          {report.work_scheduled_tomorrow && <Field label="Scheduled for tomorrow" value={report.work_scheduled_tomorrow} />}
          {report.products && <Field label="Products" value={report.products} />}
          {report.issues && <Field label="Issues" value={report.issues} />}
          {report.solutions && <Field label="Solutions" value={report.solutions} />}
          {report.additional_notes && <Field label="Additional notes" value={report.additional_notes} />}

          {report.photos?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Photos</p>
              <div className="grid grid-cols-2 gap-2">
                {report.photos.map(p => photoUrls[p.id] && (
                  <img key={p.id} src={photoUrls[p.id]} className="rounded-lg border border-gray-200 aspect-square object-cover" />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex flex-wrap gap-2">
          <button onClick={draftEmail} className="flex-1 px-3 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors">
            Draft email
          </button>
          <button onClick={printPdf} disabled={generatingPdf} className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
            {generatingPdf ? 'Generating...' : 'Print as PDF'}
          </button>
          {!report.email_sent && (
            <button onClick={onMarkEmailed} className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              Mark as emailed
            </button>
          )}
          {canDelete && onDelete && (
            <button onClick={onDelete} className="px-3 py-2 text-sm text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm text-gray-800 whitespace-pre-wrap">{value}</p>
    </div>
  )
}
