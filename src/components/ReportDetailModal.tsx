import { useEffect, useState } from 'react'
import axios from 'axios'
import type { EodConfig, EodReport } from '../types'
import { generateJobReportPDF, generateInternalReportPDF } from '../utils/generateReportPDF'

interface Props {
  report: EodReport
  config: Pick<EodConfig, 'defectsNoticeText'>
  onClose: () => void
  onMarkProcessed?: () => void
  canDelete?: boolean
  onDelete?: () => void
  canSendToClient?: boolean
}

export default function ReportDetailModal({ report, config, onClose, onMarkProcessed, canDelete, onDelete, canSendToClient = true }: Props) {
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [generatingPdf, setGeneratingPdf] = useState(false)

  useEffect(() => {
    report.photos?.forEach(p => {
      axios.get('/api/install/photos/url', { params: { pathname: p.blob_pathname } })
        .then(r => setPhotoUrls(prev => ({ ...prev, [p.id]: r.data.url })))
        .catch(() => {})
    })
  }, [report])

  const downloadJobReport = async () => {
    setGeneratingPdf(true)
    try { await generateJobReportPDF(report, config.defectsNoticeText) } finally { setGeneratingPdf(false) }
  }

  const downloadInternalReport = async () => {
    setGeneratingPdf(true)
    try { await generateInternalReportPDF(report) } finally { setGeneratingPdf(false) }
  }

  const clientPhotos = report.photos?.filter(p => !p.is_internal) ?? []
  const internalPhotos = report.photos?.filter(p => p.is_internal) ?? []

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
              {report.email_sent ? 'Processed' : 'Not processed'}
            </span>
          </div>

          <Field label="Work completed today" value={report.work_done} />
          {report.work_scheduled_tomorrow && <Field label="Scheduled for tomorrow" value={report.work_scheduled_tomorrow} />}
          {report.products && <Field label="Products" value={report.products} />}
          {report.issues && <Field label="Issues" value={report.issues} />}
          {report.solutions && <Field label="Solutions" value={report.solutions} />}
          {report.additional_notes && <Field label="Additional notes" value={report.additional_notes} />}

          {clientPhotos.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Photos</p>
              <div className="grid grid-cols-2 gap-2">
                {clientPhotos.map(p => photoUrls[p.id] && (
                  <img key={p.id} src={photoUrls[p.id]} className="rounded-lg border border-gray-200 aspect-square object-cover" />
                ))}
              </div>
            </div>
          )}

          {(report.internal_notes || internalPhotos.length > 0) && (
            <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4">
              <p className="text-xs font-bold text-red-700 uppercase tracking-wide mb-2">Internal only — not seen by the client</p>
              {report.internal_notes && <p className="text-sm text-gray-800 whitespace-pre-wrap mb-2">{report.internal_notes}</p>}
              {internalPhotos.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {internalPhotos.map(p => photoUrls[p.id] && (
                    <img key={p.id} src={photoUrls[p.id]} className="rounded-lg border-2 border-red-300 aspect-square object-cover" />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex flex-wrap gap-2">
          {canSendToClient && (
            <>
              <button onClick={downloadJobReport} disabled={generatingPdf} className="flex-1 px-3 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors">
                {generatingPdf ? 'Generating...' : 'Download job report'}
              </button>
              <button onClick={downloadInternalReport} disabled={generatingPdf} className="flex-1 px-3 py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors">
                {generatingPdf ? 'Generating...' : 'Download internal report'}
              </button>
            </>
          )}
          {canSendToClient && !report.email_sent && onMarkProcessed && (
            <button onClick={onMarkProcessed} className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              Mark as processed
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
