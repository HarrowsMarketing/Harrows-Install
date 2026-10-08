import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import type { ReturnOptions, ReturnRecord } from '../types'
import { PRIORITIES, RETURN_REASONS, STATUS_STEPS, returnMatchesSearch, sortInProgress } from '../lib/returns'
import ReturnCard from '../components/returns/ReturnCard'
import LogReturnModal from '../components/returns/LogReturnModal'
import ReturnDetailModal, { type SectionId } from '../components/returns/ReturnDetailModal'
import ReceiveItemModal from '../components/returns/ReceiveItemModal'
import ReturnsNotificationSettings from '../components/returns/ReturnsNotificationSettings'

type View = 'progress' | 'completed' | 'all'
const EMPTY_OPTIONS: ReturnOptions = { staff: [], freightCompanies: [], factoryLocations: [], reasons: RETURN_REASONS, actions: [] }

interface Props {
  isAdmin: boolean
  deepLink?: { id: string; receive: boolean } | null
  onDeepLinkConsumed?: () => void
}

export default function ReturnsTab({ isAdmin, deepLink, onDeepLinkConsumed }: Props) {
  const [returns, setReturns] = useState<ReturnRecord[]>([])
  const [options, setOptions] = useState<ReturnOptions>(EMPTY_OPTIONS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState<View>('progress')
  const [search, setSearch] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fPriority, setFPriority] = useState('')
  const [fReason, setFReason] = useState('')
  const [showLog, setShowLog] = useState(false)
  const [showReceive, setShowReceive] = useState(false)
  const [showNotif, setShowNotif] = useState(false)
  const [detail, setDetail] = useState<{ id: string; section?: SectionId } | null>(deepLink ? { id: deepLink.id, section: deepLink.receive ? 'E' : undefined } : null)

  const loadOptions = () => axios.get('/api/install/returns/options').then(r => setOptions(r.data)).catch(() => {})
  const load = async () => {
    setError('')
    try {
      const r = await axios.get('/api/install/returns')
      setReturns(r.data.returns)
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to load returns')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load(); loadOptions() }, [])
  useEffect(() => { if (deepLink) onDeepLinkConsumed?.() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const upsert = (r: ReturnRecord | null, id?: string) => {
    if (!r) { if (id) setReturns(prev => prev.filter(x => x.id !== id)); return }
    setReturns(prev => prev.some(x => x.id === r.id) ? prev.map(x => x.id === r.id ? r : x) : [r, ...prev])
    loadOptions()
  }

  const inProgress = useMemo(() => sortInProgress(returns.filter(r => r.status !== 'completed')), [returns])
  const completed = useMemo(() => returns.filter(r => r.status === 'completed').sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || '')), [returns])
  const base = view === 'progress' ? inProgress : view === 'completed' ? completed : returns
  const visible = base.filter(r =>
    returnMatchesSearch(r, search) &&
    (!fStatus || r.status === fStatus) &&
    (!fPriority || r.priority === fPriority) &&
    (!fReason || r.reason === fReason)
  )
  const overdueCount = inProgress.filter(r => r.overdue).length
  const notReceived = inProgress.filter(r => !r.date_received)

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 className="text-lg font-bold text-gray-900">Returns</h2>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => setShowNotif(true)} title="Notification settings" className="px-3 py-2.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 bg-white">
            <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
          </button>
          <button onClick={() => setShowLog(true)} className="px-4 py-2.5 text-sm font-semibold bg-harrows-yellow text-gray-900 rounded-lg hover:brightness-95 transition-all">+ Log Return</button>
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-3">Furniture coming back to the Timaru factory — where it is, when it lands, what happens next.</p>

      <button onClick={() => setShowReceive(true)}
        className="w-full mb-4 py-3 rounded-xl bg-[#1E293B] text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#334155] transition-colors">
        <svg className="w-5 h-5 text-harrows-yellow" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        Receive an item
        <span className="text-xs font-normal text-gray-300">· photo match against {notReceived.length} on the way</span>
      </button>

      <div className="flex border-b border-gray-200 mb-3">
        {([['progress', `In Progress (${inProgress.length})`], ['completed', `Completed (${completed.length})`], ['all', 'All / History']] as const).map(([v, label]) => (
          <button key={v} onClick={() => setView(v)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${view === v ? 'border-harrows-yellow text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-700'}`}>
            {label}
            {v === 'progress' && overdueCount > 0 && <span className="ml-1.5 text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">{overdueCount} overdue</span>}
          </button>
        ))}
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search job number, job name, docket, return number or item…"
        className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-harrows-yellow/40" />
      <div className="grid grid-cols-3 gap-2 mb-4">
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-2 text-xs bg-white">
          <option value="">Any status</option>
          {STATUS_STEPS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={fPriority} onChange={e => setFPriority(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-2 text-xs bg-white">
          <option value="">Any priority</option>
          {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select value={fReason} onChange={e => setFReason(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-2 text-xs bg-white">
          <option value="">Any reason</option>
          {(options.reasons?.length ? options.reasons : RETURN_REASONS).map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-gray-400">{returns.length === 0 ? 'No returns logged yet.' : 'Nothing matches.'}</p>
      ) : (
        <div className="space-y-2">
          {visible.map(r => <ReturnCard key={r.id} r={r} onClick={() => setDetail({ id: r.id })} />)}
        </div>
      )}

      {showLog && (
        <LogReturnModal options={options} onClose={() => setShowLog(false)}
          onCreated={r => { setShowLog(false); upsert(r); setDetail({ id: r.id }) }} />
      )}
      {showReceive && (
        <ReceiveItemModal candidates={notReceived} onClose={() => setShowReceive(false)}
          onReceived={id => { setShowReceive(false); load(); setDetail({ id, section: 'E' }) }} />
      )}
      {showNotif && <ReturnsNotificationSettings onClose={() => setShowNotif(false)} />}
      {detail && (
        <ReturnDetailModal returnId={detail.id} options={options} isAdmin={isAdmin} focusSection={detail.section}
          onClose={() => setDetail(null)} onChanged={r => upsert(r, detail.id)} />
      )}
    </div>
  )
}
