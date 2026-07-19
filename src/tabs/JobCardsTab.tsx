import { useEffect, useState } from 'react'
import axios from 'axios'
import type { JobCard } from '../types'

export default function JobCardsTab() {
  const [jobs, setJobs] = useState<JobCard[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [jobNumber, setJobNumber] = useState('')
  const [projectName, setProjectName] = useState('')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async (q = '') => {
    setLoading(true)
    try {
      const r = await axios.get('/api/install/jobs', { params: q ? { search: q } : {} })
      setJobs(r.data.jobs)
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to load job cards')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const t = setTimeout(() => load(search), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const removeJob = async (id: string) => {
    if (!confirm('Remove this job card?')) return
    await axios.delete(`/api/install/jobs/${id}`)
    setJobs(prev => prev.filter(j => j.id !== id))
  }

  const addJob = async () => {
    if (!jobNumber.trim() || !projectName.trim()) return setError('Job number and project name are required')
    setSaving(true)
    setError('')
    try {
      const r = await axios.post('/api/install/jobs', { jobNumber, projectName, address })
      setJobs(prev => [r.data.job, ...prev])
      setJobNumber(''); setProjectName(''); setAddress('')
      setShowAdd(false)
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to add job card')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-1">Job cards on file</h2>
      <p className="text-sm text-gray-500 mb-4">Saved jobs the team can pick from for install reports.</p>

      <input
        type="text"
        placeholder="Search by job number, project name or address..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-harrows-yellow/40"
      />

      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-gray-400 mb-4">No job cards yet.</p>
      ) : (
        <div className="space-y-2 mb-4">
          {jobs.map(job => (
            <div key={job.id} className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <span className="shrink-0 text-xs font-mono font-bold bg-gray-900 text-white px-2 py-1 rounded">JOB {job.job_number}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{job.project_name}</p>
                  {job.address && <p className="text-xs text-gray-400 truncate">{job.address}</p>}
                </div>
              </div>
              <button onClick={() => removeJob(job.id)} className="shrink-0 text-gray-300 hover:text-red-400 transition-colors ml-2" title="Remove">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {showAdd ? (
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <input value={jobNumber} onChange={e => setJobNumber(e.target.value)} placeholder="Job number"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-harrows-yellow/40" />
          <input value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="Project name"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-harrows-yellow/40" />
          <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Address (optional)"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-harrows-yellow/40" />
          <div className="flex gap-2">
            <button onClick={() => setShowAdd(false)} className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
            <button onClick={addJob} disabled={saving} className="flex-1 px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : 'Save job card'}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)} className="px-4 py-2.5 text-sm font-semibold bg-harrows-yellow text-gray-900 rounded-lg hover:brightness-95 transition-all">
          + Add a job card
        </button>
      )}
    </div>
  )
}
