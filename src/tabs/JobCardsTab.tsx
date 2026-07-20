import { useEffect, useState } from 'react'
import axios from 'axios'
import type { JobCard } from '../types'
import JobCardModal from '../components/JobCardModal'

export default function JobCardsTab() {
  const [jobs, setJobs] = useState<JobCard[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<JobCard | null>(null)
  const [showAdd, setShowAdd] = useState(false)

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
            <button key={job.id} onClick={() => setEditing(job)}
              className="w-full text-left bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center gap-3 hover:border-gray-300 transition-colors">
              <span className="shrink-0 text-xs font-mono font-bold bg-gray-900 text-white px-2 py-1 rounded">JOB {job.job_number}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{job.project_name}</p>
                {job.address && <p className="text-xs text-gray-400 truncate">{job.address}</p>}
              </div>
            </button>
          ))}
        </div>
      )}

      <button onClick={() => setShowAdd(true)} className="px-4 py-2.5 text-sm font-semibold bg-harrows-yellow text-gray-900 rounded-lg hover:brightness-95 transition-all">
        + Add a job card
      </button>

      {showAdd && (
        <JobCardModal
          onClose={() => setShowAdd(false)}
          onSaved={job => { setShowAdd(false); if (job) setJobs(prev => [job, ...prev]) }}
        />
      )}

      {editing && (
        <JobCardModal
          job={editing}
          canDelete
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(search) }}
          onDeleted={() => { setEditing(null); setJobs(prev => prev.filter(j => j.id !== editing.id)) }}
        />
      )}
    </div>
  )
}
