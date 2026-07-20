import { useEffect, useState } from 'react'
import axios from 'axios'
import type { EodReport, JobCard, VisibleFields } from '../types'
import type { InstallerInfo } from '../utils/installerSession'
import PhotoUpload from './PhotoUpload'
import { openReportEmailDraft } from '../utils/emailDraft'

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

const PERCENT_STEPS = [0, 25, 50, 75, 100]

interface Props {
  installer: InstallerInfo
  visibleFields: VisibleFields
  defectsNoticeText: string
  onSubmitted: () => void
}

export default function NewReportForm({ installer, visibleFields, defectsNoticeText, onSubmitted }: Props) {
  const [reportKey] = useState(() => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
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
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!jobSearch.trim()) { setJobResults([]); return }
    const t = setTimeout(async () => {
      const r = await axios.get('/api/install/jobs', { params: { search: jobSearch } })
      setJobResults(r.data.jobs)
    }, 250)
    return () => clearTimeout(t)
  }, [jobSearch])

  const reset = () => {
    setJob(null); setJobSearch(''); setDate(todayStr()); setPercentComplete(0)
    setWorkDone(''); setWorkScheduledTomorrow(''); setProducts(''); setIssues(''); setSolutions('')
    setAdditionalNotes(''); setPhotoPathnames([]); setDone(false)
  }

  const submit = async () => {
    if (!workDone.trim()) return setError('Please describe what was completed today')
    setSubmitting(true)
    setError('')
    try {
      const r = await axios.post('/api/install/reports', {
        jobId: job?.id || null,
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
      const report: EodReport = { ...r.data.report, job, installer: { id: installer.id, name: installer.name }, photos: [] }
      openReportEmailDraft(report, { defectsNoticeText, emailSignoff: 'Harrows Install Team', internalCcAddress: '' })
      setDone(true)
      onSubmitted()
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to submit report')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
        <p className="text-sm font-semibold text-gray-900 mb-1">Report filed</p>
        <p className="text-xs text-gray-500 mb-4">Your email client should have opened with a draft — review it and send.</p>
        <button onClick={reset} className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors">
          New report
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl overflow-hidden bg-gradient-to-br from-[#1E293B] to-[#334155] px-5 py-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-harrows-yellow">Harrows Install Team</p>
        <p className="text-lg font-bold text-white mt-1">New install report</p>
      </div>

      <p className="text-sm text-gray-500">Fill in today's install, then submit to file it and draft the client email.</p>

      <section className="bg-white border border-gray-200 rounded-xl p-4">
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
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Installer</label>
          <p className="mt-2 text-sm font-medium text-gray-900 px-3 py-2">{installer.name}</p>
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-4">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Work completed today</label>
        <div className="flex items-center justify-between mt-3 mb-1">
          <input type="range" min={0} max={100} step={25} value={percentComplete}
            onChange={e => setPercentComplete(Number(e.target.value))} className="flex-1 accent-harrows-yellow" />
          <span className="ml-3 text-lg font-bold text-harrows-yellow w-14 text-right">{percentComplete}%</span>
        </div>
        <div className="flex justify-between text-xs text-gray-400 mb-3">
          {PERCENT_STEPS.map(p => <span key={p}>{p}%</span>)}
        </div>
        <textarea value={workDone} onChange={e => setWorkDone(e.target.value)} rows={3}
          placeholder="Describe what was completed on site today..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-4">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Work scheduled for tomorrow</label>
        <textarea value={workScheduledTomorrow} onChange={e => setWorkScheduledTomorrow(e.target.value)} rows={2}
          placeholder="What's planned for the next day on site..."
          className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
      </section>

      {visibleFields.products && (
        <section className="bg-white border border-gray-200 rounded-xl p-4">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Products</label>
          <textarea value={products} onChange={e => setProducts(e.target.value)} rows={2}
            placeholder="Products installed, delivered or outstanding..."
            className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </section>
      )}

      {visibleFields.issues_solutions && (
        <section className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Issues & Solutions</label>
          <div>
            <p className="text-xs text-gray-400 mb-1">Issues</p>
            <textarea value={issues} onChange={e => setIssues(e.target.value)} rows={2}
              placeholder="Any issues encountered..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Solutions</p>
            <textarea value={solutions} onChange={e => setSolutions(e.target.value)} rows={2}
              placeholder="How issues were resolved..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </section>
      )}

      {visibleFields.photos && (
        <section className="bg-white border border-gray-200 rounded-xl p-4">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">End of day photos</label>
          <div className="mt-2">
            <PhotoUpload reportKey={reportKey} pathnames={photoPathnames} onChange={setPhotoPathnames} />
          </div>
        </section>
      )}

      <section className="bg-white border border-gray-200 rounded-xl p-4">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Additional notes</label>
        <textarea value={additionalNotes} onChange={e => setAdditionalNotes(e.target.value)} rows={2}
          placeholder="Anything else worth noting — last minute changes, instructions, reminders, anything that doesn't fit above..."
          className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
      </section>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button onClick={submit} disabled={submitting}
        className="w-full py-3 text-sm font-semibold bg-gray-900 text-white rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-colors">
        {submitting ? 'Submitting...' : 'Submit report & draft email'}
      </button>
    </div>
  )
}
