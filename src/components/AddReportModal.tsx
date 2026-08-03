import { useEffect, useState } from 'react'
import axios from 'axios'
import type { EodReport, Installer, JobCard, VisibleFields } from '../types'
import PhotoUpload from './PhotoUpload'

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

const PERCENT_STEPS = [0, 25, 50, 75, 100]

interface Props {
  visibleFields: VisibleFields
  onClose: () => void
  onSaved: (report: EodReport) => void
}

// Lets office staff file a report on an installer's behalf (e.g. phoned it in) —
// same shape as the installer's own NewReportForm, but with an installer picker
// since there's no PIN session here to imply who it's for.
export default function AddReportModal({ visibleFields, onClose, onSaved }: Props) {
  const [reportKey] = useState(() => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  const [installers, setInstallers] = useState<Installer[]>([])
  const [installerId, setInstallerId] = useState('')
  const [jobSearch, setJobSearch] = useState('')
  const [jobResults, setJobResults] = useState<JobCard[]>([])
  const [job, setJob] = useState<JobCard | null>(null)
  const [date, setDate] = useState(todayStr())
  const [percentComplete, setPercentComplete] = useState(0)
  const [workDone, setWorkDone] = useState('')
  const [workScheduledTomorrow, setWorkScheduledTomorrow] = useState('')
  const [products, setProducts] = useState('')
  const [issues, setIssues] = useState('')
  const [solutions, setSolutions] = useState('')
  const [additionalNotes, setAdditionalNotes] = useState('')
  const [photoPathnames, setPhotoPathnames] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    axios.get('/api/install/people').then(r => setInstallers(r.data.people)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!jobSearch.trim()) { setJobResults([]); return }
    const t = setTimeout(async () => {
      const r = await axios.get('/api/install/jobs', { params: { search: jobSearch } })
      setJobResults(r.data.jobs)
    }, 250)
    return () => clearTimeout(t)
  }, [jobSearch])

  const submit = async () => {
    if (!installerId) return setError('Please select who this report is for')
    if (!workDone.trim()) return setError('Please describe what was completed')
    setSubmitting(true)
    setError('')
    try {
      const r = await axios.post('/api/install/reports', {
        jobId: job?.id || null,
        installerId,
        reportDate: date,
        percentComplete,
        workDone,
        workScheduledTomorrow,
        products: visibleFields.products ? products : undefined,
        issues: visibleFields.issues_solutions ? issues : undefined,
        solutions: visibleFields.issues_solutions ? solutions : undefined,
        additionalNotes,
        photoPathnames: visibleFields.photos ? photoPathnames : [],
      })
      onSaved(r.data.report)
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to submit report')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <p className="text-sm font-bold text-gray-900">Add a report</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Installer</label>
            <select value={installerId} onChange={e => setInstallerId(e.target.value)}
              className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm">
              <option value="">Select who this report is for...</option>
              {installers.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Job</label>
            {job ? (
              <div className="mt-2 flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">{job.project_name}</p>
                  <p className="text-xs text-gray-400">Job {job.job_number}</p>
                </div>
                <button onClick={() => setJob(null)} className="text-xs text-gray-400 hover:text-gray-600">Change</button>
              </div>
            ) : (
              <div className="mt-2 relative">
                <input
                  value={jobSearch}
                  onChange={e => setJobSearch(e.target.value)}
                  placeholder="Search by job number or project name..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm"
                />
                {jobResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                    {jobResults.map(j => (
                      <button key={j.id} onClick={() => { setJob(j); setJobResults([]) }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0">
                        <p className="font-medium text-gray-900">{j.project_name}</p>
                        <p className="text-xs text-gray-400">Job {j.job_number}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Work completed</label>
            <div className="flex items-center justify-between mt-3 mb-1">
              <input type="range" min={0} max={100} step={25} value={percentComplete}
                onChange={e => setPercentComplete(Number(e.target.value))} className="flex-1 accent-harrows-yellow" />
              <span className="ml-3 text-lg font-bold text-harrows-yellow w-14 text-right">{percentComplete}%</span>
            </div>
            <div className="flex justify-between text-xs text-gray-400 mb-3">
              {PERCENT_STEPS.map(p => <span key={p}>{p}%</span>)}
            </div>
            <textarea value={workDone} onChange={e => setWorkDone(e.target.value)} rows={3}
              placeholder="Describe what was completed on site..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Work scheduled for tomorrow</label>
            <textarea value={workScheduledTomorrow} onChange={e => setWorkScheduledTomorrow(e.target.value)} rows={2}
              className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>

          {visibleFields.products && (
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Products</label>
              <textarea value={products} onChange={e => setProducts(e.target.value)} rows={2}
                className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          )}

          {visibleFields.issues_solutions && (
            <div className="space-y-3">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Issues & Solutions</label>
              <div>
                <p className="text-xs text-gray-400 mb-1">Issues</p>
                <textarea value={issues} onChange={e => setIssues(e.target.value)} rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Solutions</p>
                <textarea value={solutions} onChange={e => setSolutions(e.target.value)} rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
          )}

          {visibleFields.photos && (
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">End of day photos</label>
              <div className="mt-2">
                <PhotoUpload reportKey={reportKey} pathnames={photoPathnames} onChange={setPhotoPathnames} />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Additional notes</label>
            <textarea value={additionalNotes} onChange={e => setAdditionalNotes(e.target.value)} rows={2}
              className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-gray-100">
          <button onClick={submit} disabled={submitting}
            className="w-full py-3 text-sm font-semibold bg-gray-900 text-white rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-colors">
            {submitting ? 'Submitting...' : 'Add report'}
          </button>
        </div>
      </div>
    </div>
  )
}
