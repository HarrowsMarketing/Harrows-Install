import type { ReturnRecord } from '../../types'
import { firstSitePhoto, fmtDate, priorityBadge, priorityLabel, statusLabel } from '../../lib/returns'
import { PhotoThumb } from './ReturnPhotoGrid'

export default function ReturnCard({ r, onClick }: { r: ReturnRecord; onClick: () => void }) {
  const photo = firstSitePhoto(r)
  const freight = r.freight_company
    ? `${r.freight_company} · ${r.freight_docket ? `Docket ${r.freight_docket}` : 'Docket pending'}`
    : r.freight_docket ? `Docket ${r.freight_docket}` : 'No freight booked yet'
  return (
    <button onClick={onClick}
      className={`w-full text-left bg-white border rounded-xl px-3 py-3 flex gap-3 hover:border-gray-300 transition-colors ${r.overdue ? 'border-red-300' : 'border-gray-200'}`}>
      <PhotoThumb pathname={photo?.blob_pathname ?? null} url={photo?.url} className="w-16 h-16" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono font-bold bg-gray-900 text-white px-2 py-0.5 rounded">{r.return_number}</span>
          <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${priorityBadge(r.priority)}`}>{priorityLabel(r.priority)}</span>
          {r.overdue && <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-300">Overdue</span>}
          <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{statusLabel(r.status)}</span>
        </div>
        <p className="text-sm font-medium text-gray-900 truncate mt-1">
          <span className="font-mono text-xs text-gray-500 mr-1.5">JOB {r.original_job_number}</span>{r.original_job_name}
        </p>
        <p className="text-xs text-gray-500 truncate">{r.reason}{r.items[0]?.description ? ` · ${r.items[0].description}` : ''}</p>
        <div className="flex items-center justify-between gap-2 mt-1">
          <p className={`text-xs truncate ${!r.freight_docket && r.freight_company ? 'text-amber-600' : 'text-gray-400'}`}>{freight}</p>
          {r.status === 'completed' ? (
            <p className="text-xs text-green-600 shrink-0">Done {r.completed_at ? new Date(r.completed_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' }) : ''}</p>
          ) : r.date_received ? (
            <p className="text-xs text-green-600 shrink-0">Received {fmtDate(r.date_received)}</p>
          ) : r.estimated_arrival_date ? (
            <p className={`text-xs shrink-0 font-medium ${r.overdue ? 'text-red-600' : 'text-gray-700'}`}>Arrives {fmtDate(r.estimated_arrival_date)}</p>
          ) : (
            <p className="text-xs text-gray-400 shrink-0">No ETA</p>
          )}
        </div>
      </div>
    </button>
  )
}
