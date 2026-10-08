import type { ReturnRecord } from '../../types'
import { STATUS_STEPS, statusIndex } from '../../lib/returns'

export default function StatusTracker({ r, compact }: { r: ReturnRecord; compact?: boolean }) {
  const idx = statusIndex(r.status)
  return (
    <div>
      <div className="flex items-center">
        {STATUS_STEPS.map((s, i) => {
          const done = i <= idx
          const current = i === idx
          return (
            <div key={s.value} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div className={`rounded-full flex items-center justify-center ${compact ? 'w-4 h-4' : 'w-6 h-6'} ${
                  done ? (r.overdue && current ? 'bg-red-600' : 'bg-harrows-yellow') : 'bg-gray-200'
                } ${current ? 'ring-4 ring-harrows-yellow/30' : ''}`}>
                  {done && <svg className={compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} fill="none" viewBox="0 0 24 24" stroke="#111827" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                </div>
              </div>
              {i < STATUS_STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-1 ${i < idx ? 'bg-harrows-yellow' : 'bg-gray-200'}`} />}
            </div>
          )
        })}
      </div>
      {!compact && (
        <div className="flex justify-between mt-1.5">
          {STATUS_STEPS.map((s, i) => (
            <span key={s.value} className={`text-[10px] uppercase tracking-wide ${i === idx ? 'font-bold text-gray-900' : 'text-gray-400'}`}>{s.short}</span>
          ))}
        </div>
      )}
    </div>
  )
}
