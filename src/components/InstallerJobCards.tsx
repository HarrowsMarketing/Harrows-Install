import { useEffect, useState } from 'react'
import axios from 'axios'
import type { JobCard } from '../types'

export default function InstallerJobCards() {
  const [jobs, setJobs] = useState<JobCard[]>([])
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [jobNumber, setJobNumber] = useState('')
  const [projectName, setProjectName] = useState('')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async (q = '') => {
    const r = await axios.get('/api/install/jobs', { params: q ? { search: q } : {} })
    setJobs(r.data.jobs)
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    const t = setTimeout(() => load(search), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

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
      <h2 className="text-base font-bold text-gray-900 mb-3">Job cards</h2>
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by job number or project name..."
        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm mb-3"
      />
      <div className="space-y-2 mb-4">
        {jobs.map(job => (
          <div key={job.id} className="bg-white border border-gray-200 rounded-lg px-4 py-3">
            <span className="text-xs font-mono font-bold bg-gray-900 text-white px-2 py-0.5 rounded mr-2">JOB {job.job_number}</span>
            <span className="text-sm font-medium text-gray-900">{job.project_name}</span>
            {job.address && <p className="text-xs text-gray-400 mt-1">{job.address}</p>}
          </div>
        ))}
        {jobs.length === 0 && <p className="text-sm text-gray-400">No job cards found.</p>}
      </div>

      {showAdd ? (
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <input value={jobNumber} onChange={e => setJobNumber(e.target.value)} placeholder="Job number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <input value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="Project name" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Address (optional)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button onClick={() => setShowAdd(false)} className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg">Cancel</button>
            <button onClick={addJob} disabled={saving} className="flex-1 px-4 py-2 text-sm bg-gray-900 text-white rounded-lg disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)} className="w-full py-2.5 text-sm font-semibold bg-harrows-yellow text-gray-900 rounded-lg">
          + Scan / add a job card
        </button>
      )}
    </div>
  )
}
