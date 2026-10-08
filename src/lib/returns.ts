import type { ReturnPriority, ReturnRecord, ReturnStatus } from '../types'

export const RETURN_REASONS = ['Freight damage', 'Site damage', 'Manufacturing issue', 'Incorrect item', 'Warranty', 'Loan gear', 'Other']
export const RETURN_ACTIONS = ['Repair', 'Replace', 'Rework', 'Inspect', 'Return to stock', 'Dispose', 'Other']

export const PRIORITIES: { value: ReturnPriority; label: string; badge: string }[] = [
  { value: 'urgent', label: 'Urgent', badge: 'bg-red-600 text-white' },
  { value: 'high', label: 'High', badge: 'bg-orange-500 text-white' },
  { value: 'normal', label: 'Normal', badge: 'bg-gray-200 text-gray-700' },
]
export const priorityBadge = (p: ReturnPriority) => PRIORITIES.find(x => x.value === p)?.badge ?? PRIORITIES[2].badge
export const priorityLabel = (p: ReturnPriority) => PRIORITIES.find(x => x.value === p)?.label ?? 'Normal'
const PRIORITY_RANK: Record<ReturnPriority, number> = { urgent: 0, high: 1, normal: 2 }

export const STATUS_STEPS: { value: ReturnStatus; label: string; short: string }[] = [
  { value: 'logged', label: 'Logged', short: 'Logged' },
  { value: 'freight_booked', label: 'Freight booked', short: 'Booked' },
  { value: 'in_transit', label: 'In transit', short: 'Transit' },
  { value: 'received', label: 'Received at factory', short: 'Received' },
  { value: 'completed', label: 'Completed', short: 'Done' },
]
export const statusLabel = (s: ReturnStatus) => STATUS_STEPS.find(x => x.value === s)?.label ?? s
export const statusIndex = (s: ReturnStatus) => Math.max(0, STATUS_STEPS.findIndex(x => x.value === s))

export const RETURN_EVENTS: { key: string; label: string; hint?: string }[] = [
  { key: 'new_return', label: 'New return logged' },
  { key: 'freight_booked', label: 'Docket number added / freight booked' },
  { key: 'overdue', label: 'Return is overdue', hint: 'Estimated arrival has passed and it has not been received. Checked once a day.' },
  { key: 'received', label: 'Item received at factory' },
  { key: 'completed', label: 'Return completed' },
  { key: 'urgent_logged', label: 'Any URGENT return logged', hint: 'Separate toggle, so you can get urgent ones only.' },
]

// NZ calendar day — the factory is in Timaru, so "today" means NZ today regardless of
// whichever timezone the browser happens to be in.
export const todayNZ = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })

export function fmtDate(d: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  if (!d) return ''
  return new Date(d + 'T00:00:00').toLocaleDateString('en-NZ', opts)
}
export function fmtDateLong(d: string | null | undefined) {
  return fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}
export function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-NZ', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

// In Progress ordering: Urgent first, then soonest estimated arrival (unknown dates last).
export function sortInProgress(list: ReturnRecord[]) {
  return [...list].sort((a, b) => {
    const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    if (p !== 0) return p
    if (a.estimated_arrival_date && b.estimated_arrival_date) return a.estimated_arrival_date.localeCompare(b.estimated_arrival_date)
    if (a.estimated_arrival_date) return -1
    if (b.estimated_arrival_date) return 1
    return b.created_at.localeCompare(a.created_at)
  })
}

export function returnMatchesSearch(r: ReturnRecord, q: string) {
  const s = q.trim().toLowerCase()
  if (!s) return true
  const hay = [
    r.return_number, r.original_job_number, r.original_job_name, r.freight_docket, r.new_so_number,
    ...r.items.map(i => i.description),
  ].filter(Boolean).join(' ').toLowerCase()
  return hay.includes(s)
}

export const firstSitePhoto = (r: ReturnRecord) => r.photos.find(p => p.kind === 'site') ?? r.photos[0] ?? null

export const RETURN_APP_URL = 'https://installs.harrows.co.nz'
export const returnLink = (id: string, receive = false) => `${RETURN_APP_URL}/returns/${id}${receive ? '?receive=1' : ''}`

// Deep link from a QR tag / email: /returns/<id>[?receive=1] or /admin/returns/<id>
export function getReturnDeepLink(): { id: string; receive: boolean } | null {
  const m = /^\/(?:admin\/)?returns\/([0-9a-f-]{36})/i.exec(window.location.pathname)
  if (!m) return null
  return { id: m[1], receive: new URLSearchParams(window.location.search).get('receive') === '1' }
}
export function clearReturnDeepLink(fallbackPath: string) {
  if (getReturnDeepLink()) window.history.replaceState(null, '', fallbackPath)
}
