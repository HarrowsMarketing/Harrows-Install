import { useEffect, useState } from 'react'
import axios from 'axios'
import type { JobCard } from '../types'
import JobCardModal from './JobCardModal'

export default function InstallerJobCards() {
  const [jobs, setJobs] = useState<JobCard[]>([])
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)

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

      <button onClick={() => setShowAdd(true)} className="w-full py-2.5 text-sm font-semibold bg-harrows-yellow text-gray-900 rounded-lg">
        + Scan / add a job card
      </button>

      {showAdd && (
        <JobCardModal
          onClose={() => setShowAdd(false)}
          onSaved={job => { setShowAdd(false); if (job) setJobs(prev => [job, ...prev]) }}
        />
      )}
    </div>
  )
}
